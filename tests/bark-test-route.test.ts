import assert from "node:assert/strict";

async function run() {
  const { POST } = await import("../app/api/settings/test-bark/route");
  assert.equal((await POST(new Request("http://localhost/api/settings/test-bark", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" }))).status, 400);
  const originalFetch = globalThis.fetch;
  let body = "";
  globalThis.fetch = async (_url, init) => { body = String(init?.body); return new Response("ok"); };
  try {
    const response = await POST(new Request("http://localhost/api/settings/test-bark", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ webhookUrl: "https://api.day.app/device-key" }) }));
    assert.equal(response.status, 200);
    assert.deepEqual(JSON.parse(body), { title: "ohttps-deploy · Bark 测试消息", body: "事件：notification.test\n对象：notification", group: "ohttps-deploy" });
  } finally { globalThis.fetch = originalFetch; }
  console.log("Bark test route tests passed");
}

run();
