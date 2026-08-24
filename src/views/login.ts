/**
 * Passwordless sign-in for the auth harness (ADR 012).
 *
 * Two steps, one screen: ask for an email, then ask for the code that arrives.
 * There is no sign-up mode any more and no password field — an address that
 * proves it can receive a code gets an account, so "sign in" and "sign up" are
 * the same act and presenting them as a choice only asks the user a question
 * the system does not need answered.
 *
 * This is GUI 1, the harness (ADR 008). The SPA has its own login screen that
 * drives the same two endpoints — see src/web/pages/login.tsx.
 */
export function loginPage(): string {
  return `
  <div class="card bg-base-100 shadow-xl w-full max-w-md">
    <div class="card-body">
      <h1 class="card-title text-2xl" id="title">Sign In</h1>
      <p class="text-base-content/60 text-sm mb-4" id="subtitle">We'll email you a code — no password needed</p>
      <div class="alert alert-error text-sm hidden" id="error"></div>

      <form id="emailForm">
        <label class="label" for="email">Email</label>
        <input type="email" id="email" name="email" placeholder="you@example.com" required autocomplete="email"
               class="input input-bordered w-full mb-4" data-testid="email-input" />
        <button type="submit" id="sendBtn" class="btn btn-primary w-full" data-testid="send-code">Email me a code</button>
      </form>

      <form id="otpForm" class="hidden">
        <p class="text-sm text-base-content/70 mb-3">
          Code sent to <span class="font-medium" id="sentTo"></span>. It expires in 10 minutes.
        </p>
        <label class="label" for="otp">6-digit code</label>
        <!-- inputmode numeric + one-time-code so phones offer the code from the
             notification instead of making people switch apps to read it. -->
        <input type="text" id="otp" name="otp" placeholder="000000" required
               inputmode="numeric" pattern="[0-9]{6}" maxlength="6" autocomplete="one-time-code"
               class="input input-bordered w-full mb-4 tracking-[0.4em] text-center text-lg" data-testid="otp-input" />
        <button type="submit" id="verifyBtn" class="btn btn-primary w-full" data-testid="verify-code">Sign in</button>
        <button type="button" class="btn btn-ghost btn-sm w-full mt-2" data-testid="use-different-email"
                onclick="backToEmail()">Use a different email</button>
      </form>

      <a href="/" class="link text-center mt-4 text-sm text-base-content/40">Back to home</a>
      <div class="divider text-xs text-base-content/40">Dev accounts</div>
      <div class="flex gap-2 flex-wrap justify-center">
        <button onclick="fillDev('admin@remy.dev')" class="btn btn-ghost btn-xs">Admin</button>
        <button onclick="fillDev('organizer@remy.dev')" class="btn btn-ghost btn-xs">Organizer</button>
        <button onclick="fillDev('coach@remy.dev')" class="btn btn-ghost btn-xs">Coach</button>
        <button onclick="fillDev('player@remy.dev')" class="btn btn-ghost btn-xs">Player</button>
        <button onclick="fillDev('spectator@remy.dev')" class="btn btn-ghost btn-xs">Spectator</button>
        <button onclick="fillDev('referee@remy.dev')" class="btn btn-ghost btn-xs">Referee</button>
      </div>
    </div>
  </div>
  <script>
    const emailForm = document.getElementById('emailForm')
    const otpForm = document.getElementById('otpForm')
    const errorEl = document.getElementById('error')

    function showError(msg) {
      errorEl.textContent = msg
      errorEl.classList.remove('hidden')
    }

    function backToEmail() {
      otpForm.classList.add('hidden')
      emailForm.classList.remove('hidden')
      errorEl.classList.add('hidden')
      document.getElementById('otp').value = ''
    }

    // Dev shortcut fills the address and requests a code. It cannot fill the
    // code itself — that only exists in the mail the server just sent, which
    // is the whole point of the mechanism.
    function fillDev(email) {
      document.getElementById('email').value = email
      emailForm.dispatchEvent(new Event('submit', { cancelable: true }))
    }

    emailForm.addEventListener('submit', async (e) => {
      e.preventDefault()
      const btn = document.getElementById('sendBtn')
      btn.disabled = true
      errorEl.classList.add('hidden')
      const email = document.getElementById('email').value
      try {
        const res = await fetch('/api/auth/email-otp/send-verification-otp', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, type: 'sign-in' }),
        })
        if (res.ok) {
          document.getElementById('sentTo').textContent = email
          emailForm.classList.add('hidden')
          otpForm.classList.remove('hidden')
          document.getElementById('otp').focus()
        } else {
          const data = await res.json().catch(() => ({}))
          showError(data.message || 'Could not send a code. Please try again.')
        }
      } catch (err) {
        showError('Network error. Please try again.')
      } finally {
        btn.disabled = false
      }
    })

    otpForm.addEventListener('submit', async (e) => {
      e.preventDefault()
      const btn = document.getElementById('verifyBtn')
      btn.disabled = true
      errorEl.classList.add('hidden')
      try {
        const res = await fetch('/api/auth/sign-in/email-otp', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: document.getElementById('email').value,
            otp: document.getElementById('otp').value,
          }),
        })
        if (res.ok) {
          window.location.href = '/'
        } else {
          const data = await res.json().catch(() => ({}))
          // Better Auth counts attempts and invalidates the code after three,
          // so say that rather than inviting an endless retry loop.
          showError(data.message || 'That code was not right. Check it, or request a new one.')
        }
      } catch (err) {
        showError('Network error. Please try again.')
      } finally {
        btn.disabled = false
      }
    })
  </script>`
}
