import { Hono } from "hono"
import type { AppEnv } from "../types"

const login = new Hono<AppEnv>()

login.get("/login", (c) => {
  const user = c.get("user")
  if (user) {
    return c.redirect("/")
  }

  return c.html(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Sign In — Remy Sport</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: system-ui, -apple-system, sans-serif; background: #0a0a0a; color: #fafafa; min-height: 100vh; display: flex; align-items: center; justify-content: center; }
    .card { background: #1a1a1a; border: 1px solid #333; border-radius: 12px; padding: 2rem; width: 100%; max-width: 400px; }
    h1 { font-size: 1.5rem; margin-bottom: 0.25rem; }
    .subtitle { color: #888; margin-bottom: 1.5rem; font-size: 0.9rem; }
    label { display: block; font-size: 0.875rem; color: #ccc; margin-bottom: 0.25rem; }
    input { width: 100%; padding: 0.625rem 0.75rem; background: #0a0a0a; border: 1px solid #333; border-radius: 6px; color: #fafafa; font-size: 1rem; margin-bottom: 1rem; outline: none; }
    input:focus { border-color: #555; }
    .name-field { display: none; }
    button { width: 100%; padding: 0.75rem; background: #fff; color: #0a0a0a; border: none; border-radius: 6px; font-size: 1rem; font-weight: 600; cursor: pointer; transition: opacity 0.2s; }
    button:hover { opacity: 0.9; }
    button:disabled { opacity: 0.5; cursor: not-allowed; }
    .toggle { text-align: center; margin-top: 1rem; color: #888; font-size: 0.875rem; }
    .toggle a { color: #fff; text-decoration: underline; cursor: pointer; }
    .error { background: #2a1515; border: 1px solid #5a2020; color: #ff6b6b; padding: 0.625rem; border-radius: 6px; margin-bottom: 1rem; font-size: 0.875rem; display: none; }
    .back { display: block; text-align: center; margin-top: 1.5rem; color: #888; text-decoration: none; font-size: 0.875rem; }
    .back:hover { color: #fff; }
  </style>
</head>
<body>
  <div class="card">
    <h1 id="title">Sign In</h1>
    <p class="subtitle" id="subtitle">Welcome back</p>
    <div class="error" id="error"></div>
    <form id="authForm">
      <div class="name-field" id="nameField">
        <label for="name">Name</label>
        <input type="text" id="name" name="name" placeholder="Your name">
      </div>
      <label for="email">Email</label>
      <input type="email" id="email" name="email" placeholder="you@example.com" required>
      <label for="password">Password</label>
      <input type="password" id="password" name="password" placeholder="Min 8 characters" required minlength="8">
      <button type="submit" id="submitBtn">Sign In</button>
    </form>
    <div class="toggle">
      <span id="toggleText">Don't have an account?</span>
      <a id="toggleLink" onclick="toggleMode()">Sign Up</a>
    </div>
    <a href="/" class="back">Back to home</a>
  </div>
  <script>
    let isSignUp = new URLSearchParams(window.location.search).get('mode') === 'signup'

    function updateUI() {
      document.getElementById('title').textContent = isSignUp ? 'Create Account' : 'Sign In'
      document.getElementById('subtitle').textContent = isSignUp ? 'Get started' : 'Welcome back'
      document.getElementById('submitBtn').textContent = isSignUp ? 'Create Account' : 'Sign In'
      document.getElementById('toggleText').textContent = isSignUp ? 'Already have an account?' : "Don't have an account?"
      document.getElementById('toggleLink').textContent = isSignUp ? 'Sign In' : 'Sign Up'
      document.getElementById('nameField').style.display = isSignUp ? 'block' : 'none'
    }

    function toggleMode() {
      isSignUp = !isSignUp
      updateUI()
      document.getElementById('error').style.display = 'none'
    }

    updateUI()

    document.getElementById('authForm').addEventListener('submit', async (e) => {
      e.preventDefault()
      const btn = document.getElementById('submitBtn')
      const errorEl = document.getElementById('error')
      btn.disabled = true
      errorEl.style.display = 'none'

      const body = {
        email: document.getElementById('email').value,
        password: document.getElementById('password').value,
      }
      if (isSignUp) {
        body.name = document.getElementById('name').value
      }

      try {
        const endpoint = isSignUp ? '/api/auth/sign-up/email' : '/api/auth/sign-in/email'
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })

        if (res.ok) {
          window.location.href = '/'
        } else {
          const data = await res.json().catch(() => ({}))
          errorEl.textContent = data.message || 'Something went wrong. Please try again.'
          errorEl.style.display = 'block'
        }
      } catch (err) {
        errorEl.textContent = 'Network error. Please try again.'
        errorEl.style.display = 'block'
      } finally {
        btn.disabled = false
      }
    })
  </script>
</body>
</html>`)
})

export default login
