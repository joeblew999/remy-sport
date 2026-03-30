import { versionsWidget } from "./versions"

type User = { name: string | null; email: string } | null

export function homePage(user: User): string {
  const authSection = user
    ? `<div class="card bg-base-100 shadow mb-6">
         <div class="card-body py-3">
           <p>Signed in as <strong>${user.name || user.email}</strong></p>
         </div>
       </div>
       <div class="flex gap-4 justify-center">
         <a href="/dashboard" class="btn btn-primary">Dashboard</a>
         <a href="/api/auth/sign-out" class="btn btn-outline">Sign Out</a>
       </div>`
    : `<div class="flex gap-4 justify-center">
         <a href="/login" class="btn btn-primary">Sign In</a>
         <a href="/login?mode=signup" class="btn btn-outline">Create Account</a>
       </div>`

  return `
  <div class="text-center max-w-xl px-8">
    <h1 class="text-5xl font-bold mb-2">Remy Sport</h1>
    <p class="text-base-content/60 text-lg mb-8">Sports platform for basketball</p>
    ${authSection}
    ${versionsWidget()}
  </div>`
}
