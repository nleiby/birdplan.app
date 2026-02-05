import React from "react";
import Icon from "components/Icon";
import { useTrip } from "providers/trip";
import useTripMutation from "hooks/useTripMutation";

type Props = {
  code: string;
  /** Optional label for accessibility (e.g. "Add to favorites: American Robin"). */
  ariaLabel?: string;
};

export default function FavButton({ code, ariaLabel }: Props) {
  const { trip, canEdit } = useTrip();
  const isFav = trip?.targetStars?.includes(code) ?? false;

  const addFavMutation = useTripMutation<{ code: string }>({
    url: `/trips/${trip?._id}/targets/add-star`,
    method: "PATCH",
    updateCache: (old, input) => ({
      ...old,
      targetStars: [...(old.targetStars ?? []), input.code],
    }),
  });

  const removeFavMutation = useTripMutation<{ code: string }>({
    url: `/trips/${trip?._id}/targets/remove-star`,
    method: "PATCH",
    updateCache: (old, input) => ({
      ...old,
      targetStars: (old.targetStars || []).filter((it) => it !== input.code),
    }),
  });

  const onClick = () => {
    if (isFav) {
      removeFavMutation.mutate({ code });
    } else {
      addFavMutation.mutate({ code });
    }
  };
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-base"
      disabled={!canEdit}
      aria-label={ariaLabel ?? (isFav ? "Remove from favorites" : "Add to favorites")}
    >
      {isFav ? <Icon name="heartSolid" className="text-pink-700" /> : <Icon name="heart" />}
    </button>
  );
}
