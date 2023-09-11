export const validateEmail = (email: string) => {
  return /^([a-zA-Z0-9])(([a-zA-Z0-9])*([._-])?([a-zA-Z0-9]))*@(([a-zA-Z0-9\-])+(\.))+([a-zA-Z]{2,4})+$/.test(email);
}

export const validateUserName = (name: string) => {
  return /^[a-zA-Z0-9_]{4,16}$/.test(name);
}

export const validatePassword = (password: string) => {
  return password.length >= 6 || password.length <= 16;
}