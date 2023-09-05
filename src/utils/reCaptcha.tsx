class ReCaptcha {
  private siteKey: string;
  private action: string;

  constructor(siteKey: string, action: string) {
    this.siteKey = siteKey;
    this.action = action;
  }

  render() {
    const scriptId = 'recaptcha-script';

    if (!document.getElementById(scriptId)) {
      const script = document.createElement('script');
      script.id = scriptId;
      script.src = `https://www.recaptcha.net/recaptcha/api.js?render=${this.siteKey}`;
      document.body.appendChild(script);
    }
  }

  async getToken(): Promise<string> {
    return new Promise<string>((resolve) => {
      window.grecaptcha.ready(() => {
        window.grecaptcha.execute(this.siteKey, { action: this.action }).then((token: string) => {
          resolve(token);
        });
      });
    });
  }

  destroy() {
    const scriptId = 'recaptcha-script';
    const script = document.getElementById(scriptId);
    if (script) {
      script.remove();
    }

    const iframe = document.querySelector('.grecaptcha-badge');
    if (iframe) {
      iframe.remove();
    }
  }
}

export default ReCaptcha;