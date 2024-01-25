export const checkProxy = async () => {
  const result = {
    proxyAvailable: false,
    networkError: false,
  };
  try {
    await fetch(`https://maimai.wahlap.com/maimai-mobile/error/`, { mode: 'no-cors' });
  } catch (err) {
    try {
      await fetch(window.location.href, { mode: 'no-cors' });
      result.proxyAvailable = true;
    } catch (err) {
      result.networkError = true;
    }
  }
  return result;
}