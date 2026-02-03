import React from "react";
import Icon from "components/Icon";
import { useTrip } from "providers/trip";
import useTripMutation from "hooks/useTripMutation";

type Props = {
  hotspotId: string;
  code: string;
  name: string;
  range: string;
  percent: number;
};

export default function FavButton({ hotspotId, code, name, range, percent }: Props) {
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
    <button type="button" onClick={onClick} className="text-base" disabled={!canEdit}>
      {isFav ? <Icon name="heartSolid" className="text-pink-700" /> : <Icon name="heart" />}
    </button>
  );
}
