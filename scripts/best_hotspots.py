#!/usr/bin/env python3
"""
Generate best hotspots for target species from eBird data.
Replicates the BestTargetHotspots functionality from birdplan.app

Usage:
    python best_hotspots.py

Configuration:
    Set EBIRD_API_KEY environment variable or edit the script directly.
"""

import requests
import csv
import time
import os
from dataclasses import dataclass
from typing import Optional


# --- Configuration ---
EBIRD_API_KEY = os.environ.get("EBIRD_API_KEY", "YOUR_EBIRD_API_KEY")  # Get from https://ebird.org/api/keygen
TARGETS_API_URL = "https://faas-nyc1-2ef2e6cc.doserverless.co/api/v1/web/fn-6c6abe6c-b02b-4b79-a86e-f7633e99a025/targets/get"
HOTSPOT_TARGET_CUTOFF = 3  # Minimum percent frequency to include


@dataclass
class Hotspot:
    id: str
    name: str
    lat: float
    lng: float
    species: int


@dataclass
class Target:
    code: str
    name: str
    percent: float      # Frequency for date range
    percentYr: float    # Frequency for all year


@dataclass
class TargetList:
    items: list[Target]
    N: int      # Total checklists for date range
    yrN: int    # Total checklists for all year
    hotspot_id: str
    hotspot_name: str


def fetch_hotspots(region: str) -> list[Hotspot]:
    """
    Fetch all hotspots in a region from eBird API.
    
    Args:
        region: eBird region code (e.g., 'US-CA', 'US-CA-037', 'CO')
    
    Returns:
        List of Hotspot objects
    """
    url = f"https://api.ebird.org/v2/ref/hotspot/{region}"
    params = {"fmt": "json", "key": EBIRD_API_KEY}
    
    response = requests.get(url, params=params)
    response.raise_for_status()
    
    hotspots = []
    for item in response.json():
        hotspots.append(Hotspot(
            id=item["locId"],
            name=item["locName"],
            lat=item["lat"],
            lng=item["lng"],
            species=item.get("numSpeciesAllTime", 0)
        ))
    
    return hotspots


def fetch_targets_for_hotspot(
    hotspot_id: str,
    hotspot_name: str,
    start_month: int = 1,
    end_month: int = 12,
    cutoff: int = 5
) -> Optional[TargetList]:
    """
    Fetch target species data for a specific hotspot.
    
    Args:
        hotspot_id: eBird location ID (e.g., 'L123456')
        hotspot_name: Name of the hotspot
        start_month: Start month (1-12)
        end_month: End month (1-12)
        cutoff: Minimum frequency percentage to include
    
    Returns:
        TargetList object or None if request fails
    """
    params = {
        "region": hotspot_id,
        "startMonth": start_month,
        "endMonth": end_month,
        "cutoff": cutoff
    }
    
    try:
        response = requests.get(TARGETS_API_URL, params=params, timeout=30)
        response.raise_for_status()
        data = response.json()
        
        if "items" not in data:
            return None
        
        targets = [
            Target(
                code=item["code"],
                name=item["name"],
                percent=item.get("percent", 0),
                percentYr=item.get("percentYr", 0)
            )
            for item in data["items"]
        ]
        
        return TargetList(
            items=targets,
            N=data.get("N", 0),
            yrN=data.get("yrN", 0),
            hotspot_id=hotspot_id,
            hotspot_name=hotspot_name
        )
    except Exception as e:
        print(f"Failed to fetch targets for {hotspot_id}: {e}")
        return None


def get_best_hotspots_for_species(
    species_code: str,
    all_targets: list[TargetList],
    use_yearly: bool = True,
    cutoff: float = HOTSPOT_TARGET_CUTOFF
) -> list[dict]:
    """
    Find the best hotspots for a specific species.
    
    Args:
        species_code: eBird species code (e.g., 'grhowl')
        all_targets: List of TargetList objects for all hotspots
        use_yearly: If True, use year-round frequency; otherwise use date range
        cutoff: Minimum frequency to include
    
    Returns:
        List of hotspot data sorted by frequency (highest first)
    """
    results = []
    
    for target_list in all_targets:
        # Find the species in this hotspot's target list
        species_target = next(
            (t for t in target_list.items if t.code == species_code),
            None
        )
        
        if species_target is None:
            continue
        
        percent = species_target.percentYr if use_yearly else species_target.percent
        
        if percent < cutoff:
            continue
        
        results.append({
            "hotspot_id": target_list.hotspot_id,
            "hotspot_name": target_list.hotspot_name,
            "percent": species_target.percent,
            "percentYr": species_target.percentYr,
            "N": target_list.N,
            "yrN": target_list.yrN
        })
    
    # Sort by frequency (highest first)
    sort_key = "percentYr" if use_yearly else "percent"
    results.sort(key=lambda x: x[sort_key], reverse=True)
    
    return results


def download_all_target_lists(
    hotspots: list[Hotspot],
    start_month: int = 1,
    end_month: int = 12,
    cutoff: int = 5,
    delay: float = 0.5
) -> list[TargetList]:
    """
    Download target lists for all hotspots.
    
    Args:
        hotspots: List of Hotspot objects
        start_month: Start month (1-12)
        end_month: End month (1-12)
        cutoff: Minimum frequency percentage
        delay: Delay between requests (seconds)
    
    Returns:
        List of TargetList objects
    """
    all_targets = []
    total = len(hotspots)
    
    for i, hotspot in enumerate(hotspots):
        print(f"Fetching targets for {hotspot.name} ({i+1}/{total})...")
        
        targets = fetch_targets_for_hotspot(
            hotspot_id=hotspot.id,
            hotspot_name=hotspot.name,
            start_month=start_month,
            end_month=end_month,
            cutoff=cutoff
        )
        
        if targets and targets.items:
            all_targets.append(targets)
        
        # Be nice to the API
        if i < total - 1:
            time.sleep(delay)
    
    return all_targets


def export_best_hotspots_csv(
    best_hotspots: list[dict],
    species_name: str,
    output_file: str,
    use_yearly: bool = True
):
    """
    Export best hotspots to CSV file.
    
    Args:
        best_hotspots: List of hotspot data from get_best_hotspots_for_species
        species_name: Name of the species (for display)
        output_file: Path to output CSV file
        use_yearly: Whether year-round data was used
    """
    with open(output_file, 'w', newline='', encoding='utf-8') as f:
        writer = csv.writer(f)
        writer.writerow(["Rank", "Hotspot Name", "Location ID", "Frequency (%)", "Checklists"])
        
        for i, hotspot in enumerate(best_hotspots, 1):
            percent = hotspot["percentYr"] if use_yearly else hotspot["percent"]
            checklists = hotspot["yrN"] if use_yearly else hotspot["N"]
            
            # Format percent like the JS code does
            display_percent = round(percent) if percent > 1 else percent
            
            writer.writerow([
                i,
                hotspot["hotspot_name"],
                hotspot["hotspot_id"],
                display_percent,
                checklists
            ])
    
    print(f"Exported {len(best_hotspots)} hotspots to {output_file}")


def get_all_target_species(all_targets: list[TargetList]) -> dict[str, str]:
    """
    Get all unique target species across all hotspots.
    
    Returns:
        Dict mapping species code -> species name
    """
    species = {}
    for target_list in all_targets:
        for target in target_list.items:
            if target.code not in species:
                species[target.code] = target.name
    return species


# --- Main Example Usage ---
if __name__ == "__main__":
    # Configuration for your trip
    REGION = "US-CA-037"  # Los Angeles County, CA
    START_MONTH = 3       # March
    END_MONTH = 5         # May
    SPECIES_CODE = "grhowl"  # Great Horned Owl (example)
    
    print(f"Fetching hotspots for region: {REGION}")
    hotspots = fetch_hotspots(REGION)
    print(f"Found {len(hotspots)} hotspots")
    
    # Optionally limit to top N hotspots by species count
    hotspots = sorted(hotspots, key=lambda h: h.species, reverse=True)[:50]
    print(f"Processing top {len(hotspots)} hotspots by species count")
    
    # Download target data for each hotspot
    print(f"\nDownloading target lists (months {START_MONTH}-{END_MONTH})...")
    all_targets = download_all_target_lists(
        hotspots,
        start_month=START_MONTH,
        end_month=END_MONTH,
        cutoff=3,
        delay=0.3
    )
    print(f"Downloaded targets for {len(all_targets)} hotspots")
    
    # List all available target species
    all_species = get_all_target_species(all_targets)
    print(f"\nFound {len(all_species)} unique target species")
    print("Sample species:", list(all_species.items())[:10])
    
    # Find best hotspots for a specific species
    if SPECIES_CODE in all_species:
        species_name = all_species[SPECIES_CODE]
        print(f"\nBest hotspots for {species_name} ({SPECIES_CODE}):")
        
        best = get_best_hotspots_for_species(
            species_code=SPECIES_CODE,
            all_targets=all_targets,
            use_yearly=True  # Set to False for date-range specific data
        )
        
        for i, h in enumerate(best[:10], 1):
            print(f"  {i}. {h['hotspot_name']}: {h['percentYr']:.1f}% ({h['yrN']} checklists)")
        
        # Export to CSV
        output_file = f"best-hotspots-{species_name.replace(' ', '-').lower()}.csv"
        export_best_hotspots_csv(best, species_name, output_file, use_yearly=True)
    else:
        print(f"\nSpecies {SPECIES_CODE} not found in target lists")
        print("Try one of these codes:", list(all_species.keys())[:20])

