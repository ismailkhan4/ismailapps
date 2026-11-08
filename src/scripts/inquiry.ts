/**
 * Progressive enhancement for the inquiry form: preselects "What do you need?"
 * from ?service=, shows server errors after a redirect, counts characters,
 * validates before sending, and submits with fetch so errors appear inline.
 * Without JS the form still posts normally (Turnstile needs JS, see <noscript>).
 */
type Turnstile = { reset: (el?: Element) => void };

const form = document.querySelector<HTMLFormElement>('[data-inquiry-form]');

if (form) {
  const banner = form.querySelector<HTMLElement>('[data-form-banner]')!;
  const submit = form.querySelector<HTMLButtonElement>('[data-submit]')!;
  const idle = submit.querySelector<HTMLElement>('[data-label-idle]')!;
  const busy = submit.querySelector<HTMLElement>('[data-label-busy]')!;
  const email = 'hello@ismailapps.com';

  const messages: Record<string, string> = {
    name: 'Please tell us your name.',
    email: 'Please enter a valid email address.',
    need: 'Please choose what you need.',
    stage: 'Please choose where your product is today.',
    budget: 'Please choose a budget range.',
    timeline: 'Please choose a timeline.',
    description: 'Please write at least 20 characters.',
    link: 'Please enter a full link starting with https://',
    'cf-turnstile-response': 'Please wait for the verification to finish, then send again.',
  };
  const bannerText: Record<string, string> = {
    verification: 'We could not verify that you are human. Please try again.',
    invalid: 'Some details need another look. Please check the highlighted fields.',
    delivery: `Something went wrong on our side and your details did not reach us. Please email <a href="mailto:${email}">${email}</a>.`,
    network: `We could not reach the server. Check your connection and try again, or email <a href="mailto:${email}">${email}</a>.`,
  };

  const showBanner = (key: string) => {
    banner.innerHTML = bannerText[key] ?? bannerText.delivery!;
    banner.hidden = false;
    banner.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  const setError = (name: string, message: string | null) => {
    const el = form.querySelector<HTMLElement>(`[data-error-for="${name}"]`);
    if (el) {
      el.textContent = message ?? '';
      el.hidden = !message;
    }
    form.querySelectorAll<HTMLInputElement>(`[name="${name}"]`).forEach((input) => {
      if (input.type !== 'radio') input.setAttribute('aria-invalid', message ? 'true' : 'false');
    });
  };

  // Preselect from ?service= (set by every service page's CTA) and show redirect errors.
  const params = new URLSearchParams(location.search);
  const service = params.get('service');
  if (service) {
    const radio = form.querySelector<HTMLInputElement>(`input[name="need"][value="${CSS.escape(service)}"]`);
    if (radio) radio.checked = true;
  }
  const error = params.get('error');
  if (error && bannerText[error]) showBanner(error);

  // Character counter.
  const description = form.querySelector<HTMLTextAreaElement>('textarea[name="description"]')!;
  const count = form.querySelector<HTMLElement>('[data-count]')!;
  const updateCount = () => (count.textContent = String(description.value.length));
  description.addEventListener('input', updateCount);
  updateCount();

  // Clear a field's error as soon as it is fixed.
  form.addEventListener('input', (e) => {
    const target = e.target as HTMLInputElement;
    if (target.name && target.checkValidity()) setError(target.name, null);
  });
  form.addEventListener('change', (e) => {
    const target = e.target as HTMLInputElement;
    if (target.type === 'radio') setError(target.name, null);
  });

  const validate = (): string[] => {
    const invalid: string[] = [];
    for (const name of Object.keys(messages)) {
      if (name === 'cf-turnstile-response') continue;
      const inputs = [...form.querySelectorAll<HTMLInputElement>(`[name="${name}"]`)];
      const ok = inputs.every((i) => i.checkValidity()) && (name !== 'description' || description.value.trim().length >= 20);
      setError(name, ok ? null : messages[name]!);
      if (!ok) invalid.push(name);
    }
    return invalid;
  };

  const setBusy = (on: boolean) => {
    submit.disabled = on;
    idle.hidden = on;
    busy.hidden = !on;
  };

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    banner.hidden = true;
    const invalid = validate();
    const data = new FormData(form);
    if (!String(data.get('cf-turnstile-response') ?? '')) {
      setError('cf-turnstile-response', messages['cf-turnstile-response']!);
      invalid.push('cf-turnstile-response');
    } else setError('cf-turnstile-response', null);
    if (invalid.length) {
      form.querySelector<HTMLElement>(`[name="${invalid[0]}"]`)?.focus();
      return;
    }

    setBusy(true);
    try {
      const res = await fetch(form.action, { method: 'POST', body: data, headers: { Accept: 'application/json' } });
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        redirect?: string;
        error?: string;
        errors?: Record<string, string>;
      };
      if (res.ok && json.ok) {
        location.assign(json.redirect ?? '/contact/thanks');
        return;
      }
      if (json.errors) for (const [k, v] of Object.entries(json.errors)) setError(k, v);
      showBanner(json.error === 'validation' ? 'invalid' : (json.error ?? 'delivery'));
    } catch {
      showBanner('network');
    }
    (window as unknown as { turnstile?: Turnstile }).turnstile?.reset();
    setBusy(false);
  });
}
