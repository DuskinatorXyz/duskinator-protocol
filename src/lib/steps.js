const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/* Scroll progress p (0..1) across the pinned section -> which step is active and how far its ring has filled. */
export function stepState(p, count) {
  const q = clamp(p, 0, 1) * count;
  const index = Math.min(count - 1, Math.floor(q));
  const fill = clamp(q - index, 0, 1);
  return { index, fill: q >= count ? 1 : fill };
}

export function ringFill(i, state) {
  if (i < state.index) return 1;
  if (i === state.index) return state.fill;
  return 0;
}

/* Pinned section geometry -> progress. top is the section's top edge relative to the viewport. */
export function pinProgress(top, sectionHeight, pinHeight, stickAt) {
  const travel = sectionHeight - pinHeight;
  if (travel <= 0) return 0;
  return clamp((stickAt - top) / travel, 0, 1);
}

/* Inverse: scroll offset (from the section's top) that lands inside step i. */
export function stepOffset(i, count, sectionHeight, pinHeight) {
  const travel = Math.max(0, sectionHeight - pinHeight);
  return ((i + 0.04) / count) * travel;
}
