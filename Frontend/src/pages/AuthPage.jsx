import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { Eye, EyeOff, AlertCircle, CheckCircle, Loader } from 'lucide-react';

/**
 * Email validation utility
 */
function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/**
 * Password validation utility
 */
function isValidPassword(password) {
  return password.length >= 8;
}

export default function AuthPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [authMode, setAuthMode] = useState('login');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  async function handleLogin() {
    setErrorMessage('');
    setSuccessMessage('');

    if (!email || !password) {
      setErrorMessage('Please enter both email and password');
      return;
    }

    if (!isValidEmail(email)) {
      setErrorMessage('Please enter a valid email address');
      return;
    }

    setIsLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setIsLoading(false);

    if (error) {
      setErrorMessage(error.message || 'Invalid credentials. Please try again.');
    }
  }

  async function handleSignup() {
    setErrorMessage('');
    setSuccessMessage('');

    if (!email || !password || !confirmPassword) {
      setErrorMessage('Please fill in all fields');
      return;
    }

    if (!isValidEmail(email)) {
      setErrorMessage('Please enter a valid email address');
      return;
    }

    if (!isValidPassword(password)) {
      setErrorMessage('Password must be at least 8 characters long');
      return;
    }

    if (password !== confirmPassword) {
      setErrorMessage('Passwords do not match');
      return;
    }

    setIsLoading(true);
    const { error } = await supabase.auth.signUp({ email, password });
    setIsLoading(false);

    if (error) {
      setErrorMessage(error.message || 'Failed to create account');
    } else {
      setSuccessMessage('Account created! Check your email to verify your account.');
      setEmail('');
      setPassword('');
      setConfirmPassword('');
    }
  }

  async function handleForgotPassword() {
    setErrorMessage('');
    setSuccessMessage('');

    if (!email) {
      setErrorMessage('Please enter your email address');
      return;
    }

    if (!isValidEmail(email)) {
      setErrorMessage('Please enter a valid email address');
      return;
    }

    setIsLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email);
    setIsLoading(false);

    if (error) {
      setErrorMessage(error.message || 'Failed to send reset link');
    } else {
      setSuccessMessage('Password reset link sent to your email. Check your inbox.');
    }
  }

  function switchMode(mode) {
    setAuthMode(mode);
    setErrorMessage('');
    setSuccessMessage('');
    setPassword('');
    setConfirmPassword('');
  }

  return (
    <div className="auth-screen">
      <div className="auth-box">
        {/* Logo */}
        <div className="text-center mb-2">
          <h1 className="auth-logo">
            Fin<span className="text-[var(--color-accent-primary)]">site</span>
          </h1>
          <p className="auth-sub">NSE / BSE · REG. 30 FILINGS</p>
        </div>

        {/* Error Message */}
        {errorMessage && (
          <div className="auth-error">
            <div className="flex items-start gap-3">
              <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
              <span className="text-sm">{errorMessage}</span>
            </div>
          </div>
        )}

        {/* Success Message */}
        {successMessage && (
          <div className="auth-success">
            <div className="flex items-start gap-3">
              <CheckCircle size={16} className="flex-shrink-0 mt-0.5" />
              <span className="text-sm">{successMessage}</span>
            </div>
          </div>
        )}

        {/* Login Mode */}
        {authMode === 'login' ? (
          <>
            {/* Email Input */}
            <div>
              <label className="block font-sans text-xs font-600 text-[var(--color-text-secondary)] mb-2 uppercase tracking-wide">
                Email Address
              </label>
              <input
                className="auth-input"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
                disabled={isLoading}
              />
            </div>

            {/* Password Input */}
            <div>
              <label className="block font-sans text-xs font-600 text-[var(--color-text-secondary)] mb-2 uppercase tracking-wide">
                Password
              </label>
              <div className="relative">
                <input
                  className="auth-input pr-10"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
                  disabled={isLoading}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {/* Login Button */}
            <button
              className="auth-btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
              onClick={handleLogin}
              disabled={isLoading}
            >
              {isLoading ? (
                <div className="flex items-center justify-center gap-2">
                  <Loader size={16} className="animate-spin" />
                  <span>Logging in...</span>
                </div>
              ) : (
                'LOG IN'
              )}
            </button>

            {/* Divider */}
            <div className="auth-divider" />

            {/* Forgot Password Link */}
            <button
              type="button"
              onClick={handleForgotPassword}
              className="w-full text-center auth-link font-sans text-sm hover:underline"
              disabled={isLoading}
            >
              Forgot password? Send reset link
            </button>

            {/* Switch to Signup */}
            <div className="auth-toggle">
              Don't have an account?{' '}
              <button
                type="button"
                onClick={() => switchMode('signup')}
                className="auth-link font-semibold"
              >
                Sign up
              </button>
            </div>
          </>
        ) : (
          <>
            {/* Email Input */}
            <div>
              <label className="block font-sans text-xs font-600 text-[var(--color-text-secondary)] mb-2 uppercase tracking-wide">
                Email Address
              </label>
              <input
                className="auth-input"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSignup()}
                disabled={isLoading}
              />
            </div>

            {/* Password Input */}
            <div>
              <label className="block font-sans text-xs font-600 text-[var(--color-text-secondary)] mb-2 uppercase tracking-wide">
                Password
              </label>
              <div className="relative">
                <input
                  className="auth-input pr-10"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSignup()}
                  disabled={isLoading}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              <p className="font-sans text-xs text-[var(--color-text-muted)] mt-1">
                At least 8 characters
              </p>
            </div>

            {/* Confirm Password Input */}
            <div>
              <label className="block font-sans text-xs font-600 text-[var(--color-text-secondary)] mb-2 uppercase tracking-wide">
                Confirm Password
              </label>
              <div className="relative">
                <input
                  className="auth-input pr-10"
                  type={showConfirmPassword ? 'text' : 'password'}
                  placeholder="••••••••"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSignup()}
                  disabled={isLoading}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors"
                  aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
                >
                  {showConfirmPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {/* Signup Button */}
            <button
              className="auth-btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
              onClick={handleSignup}
              disabled={isLoading}
            >
              {isLoading ? (
                <div className="flex items-center justify-center gap-2">
                  <Loader size={16} className="animate-spin" />
                  <span>Creating account...</span>
                </div>
              ) : (
                'CREATE ACCOUNT'
              )}
            </button>

            {/* Switch to Login */}
            <div className="auth-toggle">
              Already have an account?{' '}
              <button
                type="button"
                onClick={() => switchMode('login')}
                className="auth-link font-semibold"
              >
                Log in
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
