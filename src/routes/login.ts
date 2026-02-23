import { Hono } from "hono"
import type { AppEnv } from "../types"
import { layout } from "../views/layout"

const login = new Hono<AppEnv>()

login.get("/login", (c) => {
  const user = c.get("user")
  if (user) {
    return c.redirect("/")
  }

  return c.html(layout("Sign In — Remy Sport", `
  <div class="card bg-base-100 shadow-xl w-full max-w-md">
    <div class="card-body">
      <h1 class="card-title text-2xl" id="title">Sign In</h1>
      <p class="text-base-content/60 text-sm mb-4" id="subtitle">Welcome back</p>
      <div class="alert alert-error text-sm hidden" id="error"></div>
      <form id="authForm">
        <div class="hidden" id="nameField">
          <label class="label" for="name">Name</label>
          <input type="text" id="name" name="name" placeholder="Your name" autocomplete="name" class="input input-bordered w-full mb-3" />
        </div>
        <label class="label" for="email">Email</label>
        <input type="email" id="email" name="email" placeholder="you@example.com" required autocomplete="email" class="input input-bordered w-full mb-3" />
        <label class="label" for="password">Password</label>
        <input type="password" id="password" name="password" placeholder="Min 8 characters" required minlength="8" autocomplete="current-password" class="input input-bordered w-full mb-4" />
        <button type="submit" id="submitBtn" class="btn btn-primary w-full">Sign In</button>
      </form>
      <div class="text-center mt-4 text-sm text-base-content/60">
        <span id="toggleText">Don't have an account?</span>
        <a id="toggleLink" class="link link-primary ml-1 cursor-pointer" onclick="toggleMode()">Sign Up</a>
      </div>
      <a href="/" class="link text-center mt-4 text-sm text-base-content/40">Back to home</a>
    </div>
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
      document.getElementById('password').autocomplete = isSignUp ? 'new-password' : 'current-password'
    }

    function toggleMode() {
      isSignUp = !isSignUp
      updateUI()
      document.getElementById('error').classList.add('hidden')
    }

    updateUI()

    document.getElementById('authForm').addEventListener('submit', async (e) => {
      e.preventDefault()
      const btn = document.getElementById('submitBtn')
      const errorEl = document.getElementById('error')
      btn.disabled = true
      errorEl.classList.add('hidden')

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
          errorEl.classList.remove('hidden')
        }
      } catch (err) {
        errorEl.textContent = 'Network error. Please try again.'
        errorEl.classList.remove('hidden')
      } finally {
        btn.disabled = false
      }
    })
  </script>`))
})

export default login
