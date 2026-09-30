import assert from "node:assert/strict";
import test from "node:test";
import { assessReportSafety, isImmediateDangerDescription } from "../src/lib/reportSafety.ts";

test("routine descriptions do not escalate based only on a broad issue type", () => {
  assert.deepEqual(
    assessReportSafety("A pothole has formed beside the curb."),
    { level: "routine" },
  );
});

test("described injury and blocked-access consequences are classified directly", () => {
  assert.deepEqual(
    assessReportSafety("The metal cover could injure a pedestrian if it shifts."),
    { level: "serious", consequence: "injury" },
  );
  assert.deepEqual(
    assessReportSafety("The sidewalk is blocked, so wheelchair users have to enter traffic."),
    { level: "serious", consequence: "blockedAccess" },
  );
});

test("property damage and other serious hazards receive their own risk labels", () => {
  assert.deepEqual(
    assessReportSafety("A tree branch could damage nearby homes if it falls."),
    { level: "serious", consequence: "propertyDamage" },
  );
  assert.deepEqual(
    assessReportSafety("Exposed wiring creates a serious hazard beside the bus stop."),
    { level: "serious", consequence: "otherSafetyHazard" },
  );
});

test("explicitly denied risks are not escalated", () => {
  assert.deepEqual(
    assessReportSafety("There is no risk of injury here; the curb is uneven but passable."),
    { level: "routine" },
  );
});

test("past nonfatal accidents are serious but are not treated as immediate emergencies", () => {
  const assessment = assessReportSafety("A collision happened yesterday; no one was injured.");
  assert.deepEqual(assessment, { level: "serious", consequence: "accident" });
});

test("an English translation helps assess a localized resident description", () => {
  assert.deepEqual(
    assessReportSafety(
      "La acera está bloqueada y las personas en silla de ruedas no pueden pasar.",
      "The sidewalk is blocked and wheelchair users cannot pass.",
    ),
    { level: "serious", consequence: "blockedAccess" },
  );
});

test("common non-English scripts are also checked when a translation is unavailable", () => {
  assert.deepEqual(
    assessReportSafety("人行道被堵，轮椅无法通过"),
    { level: "serious", consequence: "blockedAccess" },
  );
  assert.deepEqual(
    assessReportSafety("Hay una emergencia médica y alguien no puede respirar."),
    { level: "immediate" },
  );
});

test("immediate emergencies are recognized in all supported resident languages", () => {
  const descriptions = [
    ["Arabic", "هناك حالة طوارئ"],
    ["Simplified Chinese", "有人无法呼吸"],
    ["Traditional Chinese", "有人無法呼吸"],
    ["Filipino", "May agarang emerhensiya"],
    ["Hindi", "आपातस्थिति"],
    ["Japanese", "今すぐ危険"],
    ["Korean", "응급상황"],
    ["Persian", "وضعیت اضطراری"],
    ["Portuguese", "Emergência médica"],
    ["Russian", "Чрезвычайная ситуация"],
    ["Spanish", "Emergencia"],
    ["Vietnamese", "Tình huống khẩn cấp"],
  ];

  for (const [language, description] of descriptions) {
    assert.deepEqual(
      assessReportSafety(description),
      { level: "immediate" },
      `Expected immediate-danger detection for ${language}.`,
    );
  }
});

test("blocked access is recognized in all supported resident languages", () => {
  const descriptions = [
    ["Arabic", "الممر مسدود"],
    ["Simplified Chinese", "人行道无法通行"],
    ["Traditional Chinese", "人行道無法通行"],
    ["Filipino", "Nakaharang ang daanan"],
    ["Hindi", "रास्ता बंद है"],
    ["Japanese", "通行止めです"],
    ["Korean", "출입 불가"],
    ["Persian", "مسیر مسدود است"],
    ["Portuguese", "A entrada está bloqueada"],
    ["Russian", "Вход перекрыт"],
    ["Spanish", "La entrada está bloqueada"],
    ["Vietnamese", "Lối vào bị chặn, không thể đi qua"],
  ];

  for (const [language, description] of descriptions) {
    assert.deepEqual(
      assessReportSafety(description),
      { level: "serious", consequence: "blockedAccess" },
      `Expected blocked-access detection for ${language}.`,
    );
  }
});

test("ordinary injury mentions are serious but not automatically immediate emergencies", () => {
  const descriptions = [
    ["Arabic", "شخص مصاب"],
    ["Simplified Chinese", "有人受伤"],
    ["Traditional Chinese", "有人受傷"],
    ["Filipino", "May nasaktan"],
    ["Hindi", "कोई घायल है"],
    ["Japanese", "けがをした人がいる"],
    ["Korean", "부상자가 있습니다"],
    ["Persian", "یک نفر مجروح است"],
    ["Portuguese", "Uma pessoa ficou ferida"],
    ["Russian", "Человек ранен"],
    ["Spanish", "Hay una persona herida"],
    ["Vietnamese", "Có người bị thương"],
  ];

  for (const [language, description] of descriptions) {
    assert.deepEqual(
      assessReportSafety(description),
      { level: "serious", consequence: "injury" },
      `Expected non-emergency injury classification for ${language}.`,
    );
  }
});

test("immediate danger outranks non-emergency consequences", () => {
  const description = "A person is unconscious and not breathing after a car hit them.";
  assert.equal(isImmediateDangerDescription(description), true);
  assert.deepEqual(assessReportSafety(description), { level: "immediate" });
});