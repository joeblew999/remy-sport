"use client";
import { useState } from "react";

const copy = {
  en: { label: "What do you see?", choose: "Choose a situation", states: ["Not signed in", "Browser says blocked", "Following a team, but no alerts", "Install option is missing"], answers: ["Sign in with an email code on the device where you want notifications.", "Open your browser’s site permissions and allow notifications. An app setting cannot override a browser block.", "Check browser permission, the team follow and notification preferences on Signed-in devices. Following alone does not enable alerts.", "Use the browser version. Installation availability depends on the device and browser, and it may already be installed."] },
  th: { label: "คุณพบปัญหาอะไร?", choose: "เลือกสถานการณ์", states: ["ยังไม่ได้เข้าสู่ระบบ", "เบราว์เซอร์บล็อกการแจ้งเตือน", "ติดตามทีมแล้วแต่ไม่มีแจ้งเตือน", "ไม่พบตัวเลือกติดตั้ง"], answers: ["เข้าสู่ระบบด้วยรหัสทางอีเมลบนอุปกรณ์ที่ต้องการรับการแจ้งเตือน", "เปิดการตั้งค่าสิทธิ์ของเว็บไซต์ในเบราว์เซอร์และอนุญาตการแจ้งเตือน การตั้งค่าในแอปไม่สามารถข้ามการบล็อกนี้ได้", "ตรวจสอบสิทธิ์เบราว์เซอร์ การติดตามทีม และการตั้งค่าการแจ้งเตือนในหน้าอุปกรณ์ที่เข้าสู่ระบบ การติดตามทีมอย่างเดียวไม่เปิดการแจ้งเตือน", "ใช้งานผ่านเบราว์เซอร์ได้ การติดตั้งขึ้นอยู่กับอุปกรณ์และเบราว์เซอร์ หรืออาจติดตั้งไว้แล้ว"] },
  ja: { label: "どのような状況ですか？", choose: "状況を選択", states: ["ログインしていない", "ブラウザーでブロックされている", "チームをフォローしたが通知が来ない", "インストールの選択肢がない"], answers: ["通知を受け取る端末でメールのコードを使ってログインしてください。", "ブラウザーのサイト設定で通知を許可してください。アプリの設定ではブラウザーのブロックを解除できません。", "ブラウザーの許可、チームのフォロー、ログイン中の端末ページの通知設定を確認してください。フォローだけでは通知は有効になりません。", "ブラウザー版を利用できます。インストールの可否は端末とブラウザーによって異なり、すでにインストール済みの場合もあります。"] },
};
export function Troubleshooter({ locale = "en" }: { locale?: keyof typeof copy }) {
  const [selected, setSelected] = useState("");
  const c = copy[locale];
  return <section className="my-6 rounded-xl border p-5">
    <label className="block font-medium" htmlFor="notification-situation">{c.label}</label>
    <select id="notification-situation" className="mt-3 w-full rounded-md border bg-fd-background p-3" value={selected} onChange={e => setSelected(e.target.value)}>
      <option value="">{c.choose}</option>{c.states.map((state, i) => <option key={state} value={i}>{state}</option>)}
    </select>
    <p aria-live="polite" className="mt-4">{selected !== "" ? c.answers[Number(selected)] : ""}</p>
  </section>;
}
