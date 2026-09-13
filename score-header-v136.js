/* Reflect scrolling without changing application navigation/history. */
(() => {
  const header = document.getElementById('scoreHeader');
  if (!header) return;
  function update(event) {
    const target = event && event.target;
    if (target && target !== document && target !== window && !target.contains(header)) return;
    const offset = target && target !== document && target !== window
      ? target.scrollTop : (window.scrollY || document.documentElement.scrollTop || 0);
    header.classList.toggle('score-scrolled', offset > 4);
  }
  document.addEventListener('scroll', update, {capture: true, passive: true});
  window.addEventListener('pageshow', () => update());
  update();
})();
