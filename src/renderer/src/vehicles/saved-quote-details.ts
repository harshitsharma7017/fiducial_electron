// The quote details saved with a vehicle (its Additional details, request of 26 November 2026),
// for the motor quotes to start from: read once when a quote section opens, then handed to it to
// fill its own boxes (the advisor can still change them for this quote).
import { useEffect, useRef } from 'react';
import type { VehicleQuoteDetails } from '../../../shared/contracts/vehicle';

export function useSavedQuoteDetails(
  vehicleId: string,
  apply: (details: VehicleQuoteDetails) => void,
): void {
  // The latest callback, without reading the vehicle again each time it changes.
  const applyRef = useRef(apply);
  applyRef.current = apply;
  useEffect(() => {
    let live = true;
    void window.fqf.vehicles
      .get(vehicleId)
      .then((r) => {
        const details = r.ok ? r.data.saved.vehicle.quoteDetails : undefined;
        if (live && details) applyRef.current(details);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [vehicleId]);
}
