import { Link } from 'react-router-dom'

function Register() {
  return <section className="auth-page"><p className="eyebrow">Get protected</p><h1>Create your account</h1><form className="auth-form"><label>Name<input type="text" placeholder="Your name" /></label><label>Email<input type="email" placeholder="you@example.com" /></label><label>Password<input type="password" placeholder="Choose a password" /></label><button type="submit">Create account</button></form><p>Already registered? <Link to="/login">Sign in</Link></p></section>
}

export default Register
