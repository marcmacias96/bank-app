export interface ValidationResult {
  isValid: boolean;
  error?: string;
}

export function validateEmail(email: string): ValidationResult {
  if (!email.trim()) {
    return { isValid: false, error: "Email is required" };
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return { isValid: false, error: "Please enter a valid email" };
  }

  return { isValid: true };
}

export function validatePassword(password: string): ValidationResult {
  if (!password) {
    return { isValid: false, error: "Password is required" };
  }

  if (password.length < 6) {
    return { isValid: false, error: "Password must be at least 6 characters" };
  }

  return { isValid: true };
}

export function validateConfirmPassword(
  password: string,
  confirmPassword: string
): ValidationResult {
  if (!confirmPassword) {
    return { isValid: false, error: "Please confirm your password" };
  }

  if (password !== confirmPassword) {
    return { isValid: false, error: "Passwords do not match" };
  }

  return { isValid: true };
}

export interface LoginFormErrors {
  email?: string;
  password?: string;
}

export interface RegisterFormErrors {
  email?: string;
  password?: string;
  confirmPassword?: string;
}

export function validateLoginForm(
  email: string,
  password: string
): { isValid: boolean; errors: LoginFormErrors } {
  const errors: LoginFormErrors = {};

  const emailResult = validateEmail(email);
  if (!emailResult.isValid) {
    errors.email = emailResult.error;
  }

  const passwordResult = validatePassword(password);
  if (!passwordResult.isValid) {
    errors.password = passwordResult.error;
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  };
}

export function validateRegisterForm(
  email: string,
  password: string,
  confirmPassword: string
): { isValid: boolean; errors: RegisterFormErrors } {
  const errors: RegisterFormErrors = {};

  const emailResult = validateEmail(email);
  if (!emailResult.isValid) {
    errors.email = emailResult.error;
  }

  const passwordResult = validatePassword(password);
  if (!passwordResult.isValid) {
    errors.password = passwordResult.error;
  }

  const confirmResult = validateConfirmPassword(password, confirmPassword);
  if (!confirmResult.isValid) {
    errors.confirmPassword = confirmResult.error;
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  };
}
