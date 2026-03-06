export async function sendSms(to: string, body: string): Promise<{ success: boolean; provider: string }> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const fromNumber = process.env.TWILIO_PHONE_NUMBER;

  if (!accountSid || !authToken || !fromNumber) {
    console.log("[SMS] No Twilio credentials configured — running in DEV MODE");
    console.log(`[SMS] Would send to ${to}: "${body}"`);
    return { success: true, provider: "dev" };
  }

  try {
    const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;

    const params = new URLSearchParams();
    params.append("To", to);
    params.append("From", fromNumber);
    params.append("Body", body);

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Authorization": "Basic " + btoa(`${accountSid}:${authToken}`),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    });

    if (!response.ok) {
      const errorData = await response.text();
      console.error("[SMS] Twilio error:", response.status, errorData);
      return { success: false, provider: "twilio" };
    }

    const data = await response.json();
    console.log("[SMS] Sent successfully via Twilio, SID:", data.sid);
    return { success: true, provider: "twilio" };
  } catch (error) {
    console.error("[SMS] Failed to send:", error);
    return { success: false, provider: "twilio" };
  }
}
