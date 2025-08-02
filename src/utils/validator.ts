export const validateEmail = (email: string, {
  allowEmpty = false
}) => {
  if (email.length === 0 && !allowEmpty) {
    return "邮箱不能为空";
  } else if (email.length === 0 && allowEmpty) {
    return null;
  }
  if (!/^([a-zA-Z0-9])(([a-zA-Z0-9])*([._-])?([a-zA-Z0-9]))*@(([a-zA-Z0-9\-])+(\.))+([a-zA-Z]{2,4})+$/.test(email)) {
    return "邮箱格式不正确";
  }
  return null;
}

export const validateUserName = (name: string, {
  allowEmpty = false
}) => {
  if (name.length === 0 && !allowEmpty) {
    return "用户名不能为空";
  } else if (name.length === 0 && allowEmpty) {
    return null;
  }
  if (name.length < 4 || name.length > 16) {
    return "用户名长度必须在 4 到 16 字符之间";
  }
  if (!/^[a-zA-Z0-9_]{4,16}$/.test(name)) {
    return "用户名只能包含字母、数字和下划线";
  }
  return null;
}

export const validatePassword = (password: string, {
  allowEmpty = false,
  passwordLabel = "密码"
}) => {
  if (password.length === 0 && !allowEmpty) {
    return `${passwordLabel}不能为空`;
  } else if (password.length === 0 && allowEmpty) {
    return null;
  }
  if (password.length < 6 || password.length > 16) {
    return `${passwordLabel}长度必须在 6 到 16 字符之间`;
  }
  return null;
}

export const validateUrl = (url: string, {
  allowEmpty = false,
  urlLabel = "地址"
}) => {
  if (url.length === 0 && !allowEmpty) {
    return `${urlLabel}不能为空`;
  } else if (url.length === 0 && allowEmpty) {
    return null;
  }
  const pattern = "^(https?:\\/\\/)?([a-zA-Z0-9-]+\\.)+[a-zA-Z]{2,}(\\/[a-zA-Z0-9\\-._~:/?#@!$&'()*+,;=]*)?$";
  const regex = new RegExp(pattern);
  if (!regex.test(url)) {
    return `${urlLabel}格式不正确`;
  }
  if (url.length > 200) {
    return `${urlLabel}长度不能超过 200 字符`;
  }
  return null;
}

export const validateRedirectUri = (uri: string) => {
  if (uri === "urn:ietf:wg:oauth:2.0:oob" || uri === "urn:ietf:wg:oauth:2.0:oob:auto") {
    return null;
  }
  try {
    const parsed = new URL(uri);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return "回调地址必须以 http:// 或 https:// 开头";
    }
    if (!parsed.hostname) {
      return "回调地址格式不正确";
    }
    if (parsed.hash) {
      return "回调地址格式不正确";
    }
  } catch (e) {
    return "回调地址格式不正确";
  }
}

export const validateText = (text: string, {
  allowEmpty = false,
  textLabel = "文本",
  minLength = 10,
  maxLength = 200
}) => {
  if (text.length === 0 && !allowEmpty) {
    return `${textLabel}不能为空`;
  } else if (text.length === 0 && allowEmpty) {
    return null;
  }
  if (text.length < minLength || text.length > maxLength) {
    return `${textLabel}长度必须在 ${minLength} 到 ${maxLength} 字符之间`;
  }
  return null;
}