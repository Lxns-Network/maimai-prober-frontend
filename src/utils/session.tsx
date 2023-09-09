export const isTokenExpired = () => {
  const token = localStorage.getItem('token');
  if (!token) {
    return true;
  }

  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    const currentTime = Date.now();
    const expirationTime = payload.exp * 1000;

    if (isNaN(expirationTime)) {
      return true;
    }

    return currentTime > expirationTime;
  } catch (error) {
    return true;
  }
};

export const isTokenValid = () => {
  return !isTokenExpired();
}

export const logout = () => {
  localStorage.removeItem('token');
}