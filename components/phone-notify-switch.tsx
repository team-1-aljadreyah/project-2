"use client";

// «إشعارات الهاتف»: the switch (account menu, «حسابي») that asks the phone's permission and turns them on or off,
// and says what to do when the browser has blocked them.
import { useState } from "react";
import { BellRing } from "lucide-react";
import { Switch } from "@/components/ui";
import { useFmt } from "@/lib/i18n";
import { setPhoneNotify, usePhoneNotify } from "@/lib/phone-notify";

export function PhoneNotifySwitch() {
  const { tr } = useFmt();
  const state = usePhoneNotify();
  const [busy, setBusy] = useState(false);
  if (state === "unsupported") return <p className="py-1 text-xs text-muted">{tr("هذا المتصفح لا يدعم إشعارات الهاتف.", "This browser can't show phone notifications.")}</p>;
  return (
    <div>
      <Switch
        checked={state === "on"}
        disabled={busy}
        onChange={async (v) => {
          setBusy(true);
          await setPhoneNotify(v);
          setBusy(false);
        }}
        label={
          <span className="flex items-center gap-2">
            <BellRing className="size-4" /> {tr("إشعارات الهاتف (والتطبيق في الخلفية)", "Phone notifications (app in the background)")}
          </span>
        }
      />
      {state === "blocked" && (
        <p className="mt-1 text-xs text-warning">{tr("المتصفح يمنعها: اسمح بالإشعارات لهذا الموقع من إعدادات المتصفح (رمز القفل بجانب العنوان).", "The browser blocks them: allow notifications for this site in its settings (the lock by the address).")}</p>
      )}
    </div>
  );
}
