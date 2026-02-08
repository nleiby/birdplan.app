import React from "react";

type ContextT = {
  isPrintMode: boolean;
};

export const ItineraryPrintContext = React.createContext<ContextT>({
  isPrintMode: false,
});

export function useItineraryPrint() {
  return React.useContext(ItineraryPrintContext);
}
