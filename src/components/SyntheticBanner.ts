export function mountSyntheticBanner(container: HTMLElement): void {
  const dismissed = sessionStorage.getItem('tw-banner-dismissed');
  if (dismissed) {
    container.hidden = true;
    container.closest('.tw-layout')?.classList.remove('tw-banner-visible');
    return;
  }

  const btn = container.querySelector('.tw-banner-dismiss') as HTMLButtonElement | null;
  btn?.addEventListener('click', () => {
    container.hidden = true;
    sessionStorage.setItem('tw-banner-dismissed', '1');
    document.querySelector('.tw-layout')?.classList.remove('tw-banner-visible');
  });

  document.querySelector('.tw-layout')?.classList.add('tw-banner-visible');
}
