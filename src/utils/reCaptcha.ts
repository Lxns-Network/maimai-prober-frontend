class ReCaptcha {
  private readonly siteKey: string;
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
      script.src = `https://recaptcha.google.cn/recaptcha/api.js?render=${this.siteKey}`;
      document.body.appendChild(script);
    }
  }

  async getToken(): Promise<string> {
    try {
      await new Promise<void>((resolve) => window.grecaptcha.ready(resolve));
      return await window.grecaptcha.execute(this.siteKey, {action: this.action});
    } catch (error) {
      throw new Error(`获取 reCAPTCHA 令牌失败: ${error}`);
    }
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