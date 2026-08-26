import { Link } from 'react-router-dom'

function Login() {
  return <section className="auth-page"><p className="eyebrow">Welcome back</p><h1>Sign in to VoiceShield</h1><p>Monitor calls and keep conversations safer.</p><form className="auth-form"><label>Email<input type="email" placeholder="you@example.com" /></label><label>Password<input type="password" placeholder="Your password" /></label><button type="submit">Sign in</button></form><p>New here? <Link to="/register">Create an account</Link></p></section>
}

export default Login
