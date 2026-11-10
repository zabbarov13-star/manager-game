function mountBoardZoom(viewport, { getZoom, setZoom, camera }) {
  let pinch = null;
  const points = event => {
    const [a, b] = event.touches;
    return { x: (a.clientX + b.clientX) / 2, y: (a.clientY + b.clientY) / 2,
      distance: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY) };
  };
  viewport.addEventListener('wheel', event => {
    if (event.shiftKey || !event.deltaY || Math.abs(event.deltaX) > Math.abs(event.deltaY)) return;
    const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? viewport.clientHeight : 1;
    const delta = Math.max(-100, Math.min(100, event.deltaY * unit));
    const next = clampBoardZoom(getZoom() * Math.exp(-delta / 480));
    if (next === getZoom() && !event.ctrlKey && !event.metaKey) return;
    event.preventDefault();
    camera.hold();
    setZoom(next, { x: event.clientX, y: event.clientY });
  }, { passive: false });
  viewport.addEventListener('touchstart', event => {
    if (event.touches.length === 2) {
      const point = points(event);
      pinch = point.distance > 0 ? { ...point, zoom: getZoom() } : null;
      camera.hold();
    } else pinch = null;
  }, { passive: true });
  viewport.addEventListener('touchmove', event => {
    if (!pinch || event.touches.length !== 2) return;
    const point = points(event);
    if (!point.distance || !event.cancelable) return;
    event.preventDefault();
    camera.hold();
    setZoom(pinch.zoom * point.distance / pinch.distance, point, pinch);
    pinch.x = point.x;
    pinch.y = point.y;
  }, { passive: false });
  for (const type of ['touchend', 'touchcancel']) viewport.addEventListener(type, () => { pinch = null; });
}
function clampBoardZoom(value) {
  return Math.max(.5, Math.min(2.5, value));
}
function zoomBoardAt(viewport, stage, resize, anchor, from = anchor) {
  const bounds = viewport.getBoundingClientRect();
  const point = anchor ?? { x: bounds.left + viewport.clientWidth / 2, y: bounds.top + viewport.clientHeight / 2 };
  const previous = from ?? point;
  const old = stage.getBoundingClientRect();
  const x = (previous.x - old.left) / old.width;
  const y = (previous.y - old.top) / old.height;
  resize();
  if (!old.width || !old.height) return;
  const board = stage.getBoundingClientRect();
  viewport.scrollBy({ left: board.left + x * board.width - point.x,
    top: board.top + y * board.height - point.y, behavior: 'instant' });
}
