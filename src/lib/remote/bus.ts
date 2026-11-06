// Lets the store ask the sync layer (src/store/sync.ts) to reload data from the server,
// without the two modules importing each other.

/** Parts of the app state that load together. `seats:<performanceId>` reloads one seat map. */
export type BaseSlice =
  | 'config'
  | 'people'
  | 'bookings'
  | 'productions'
  | 'schedule'
  | 'conflicts'
  | 'channels'
  | 'messages'
  | 'reads'
  | 'performances'
  | 'orders'
  | 'tickets'
  | 'layouts';
export type Slice = BaseSlice | `seats:${string}`;

export const ALL_SLICES: BaseSlice[] = [
  'config', 'people', 'bookings', 'productions', 'schedule', 'conflicts', 'channels', 'messages', 'reads',
  'performances', 'orders', 'tickets', 'layouts',
];

type Loader = (slices: Slice[]) => Promise<void>;
let loader: Loader | null = null;

export function setRefreshLoader(l: Loader | null) {
  loader = l;
}

/** Reload these parts of the state from the server (no-op in demo mode). */
export function refresh(slices: Slice[]): Promise<void> {
  return loader ? loader(slices) : Promise.resolve();
}
