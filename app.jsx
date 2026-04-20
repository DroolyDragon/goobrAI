import { jsxDEV } from "react/jsx-dev-runtime";
import React, { useState } from "react";
import { Player } from "@websim/remotion/player";
import { MyComposition } from "./composition.jsx";
const PLAYER_FPS = 30;
const FRAME_HOLD_SECONDS = 0.05;
const FRAME_HOLD_FRAMES = Math.max(1, Math.round(FRAME_HOLD_SECONDS * PLAYER_FPS));
const FRAMES_PER_SCENE = 120;
const HF_MODEL = "Motif-Technologies/Motif-Video-2B";
const HF_API_URL = `https://api-inference.huggingface.co/models/${HF_MODEL}`;
const HF_API_TOKEN = "YOUR_HF_API_TOKEN";
function App() {
  const [prompt, setPrompt] = useState("");
  const [scenes, setScenes] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [totalFrames, setTotalFrames] = useState(null);
  function splitToSentences(text) {
    return text.split(/(?<=\.)\s+|(?<=\!)\s+|(?<=\?)\s+/).map((s) => s.trim()).filter(Boolean);
  }
  function buildCharacterSpec(originalPrompt) {
    const p = originalPrompt.toLowerCase();
    if (/\bhamps?ter\b|\bhampter\b/.test(p)) {
      return [
        "photorealistic",
        "realistic lighting and anatomy",
        "single consistent character across frames",
        "character: Russian dwarf hamster, keep markings consistent",
        "front-facing slightly three-quarter angle, neutral pose, full body visible, PNG with transparent background"
      ].join(", ");
    }
    return "photorealistic, realistic lighting, PNG overlay of subject front-facing with transparent background";
  }
  async function blobToDataUrl(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }
  async function requestOverlayFromMotif(promptText) {
    const body = {
      inputs: promptText,
      parameters: {
        // hints for the model implementation; may be ignored depending on the service
        num_inference_steps: 30,
        guidance_scale: 7.5,
        height: 512,
        width: 512,
        return_as_image: true,
        transparent_background: true
      }
    };
    const res = await fetch(HF_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${HF_API_TOKEN}`,
        Accept: "application/json, image/png, */*",
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body)
    });
    const contentType = res.headers.get("content-type") || "";
    if (contentType.includes("image")) {
      const blob = await res.blob();
      const dataUrl = await blobToDataUrl(blob);
      return dataUrl;
    }
    const json = await res.json();
    if (Array.isArray(json) && json.length > 0 && json[0].binary) {
      const b64 = json[0].binary;
      return `data:image/png;base64,${b64}`;
    }
    throw new Error("Overlay generation failed (no image returned)");
  }
  async function requestFrameFromMotif(promptText, overlayDataUrl, seed) {
    const body = {
      inputs: promptText,
      parameters: {
        num_inference_steps: 28,
        guidance_scale: 7.5,
        height: 1280,
        // 9:16 portrait could be e.g., 720x1280 but be mindful of server limits
        width: 720,
        seed,
        return_as_image: true,
        // model-specific: provide image_inputs if supported by remote custom pipeline
        image_inputs: [
          {
            data_url: overlayDataUrl,
            role: "overlay"
          }
        ]
      }
    };
    const res = await fetch(HF_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${HF_API_TOKEN}`,
        Accept: "application/json, image/png, */*",
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body)
    });
    const contentType = res.headers.get("content-type") || "";
    if (contentType.includes("image")) {
      const blob = await res.blob();
      const objUrl = URL.createObjectURL(blob);
      return objUrl;
    }
    const json = await res.json();
    if (Array.isArray(json) && json.length > 0 && json[0].binary) {
      const b64 = json[0].binary;
      const dataUrl = `data:image/png;base64,${b64}`;
      const blob = await (await fetch(dataUrl)).blob();
      return URL.createObjectURL(blob);
    }
    throw new Error("Frame generation failed (no image returned)");
  }
  async function generateFrameSequenceWithOverlay(visualPrompt, overlayDataUrl, framesCount) {
    const frames = [];
    const cap = Math.min(framesCount, FRAMES_PER_SCENE);
    for (let i = 0; i < cap; i++) {
      try {
        const framePrompt = `${visualPrompt} -- slight pose variation ${i}, keep overlay centered, preserve lighting and markings`;
        const frameUrl = await requestFrameFromMotif(framePrompt, overlayDataUrl, i + 1);
        if (frameUrl) frames.push(frameUrl);
      } catch (e) {
        console.warn("frame generation failed for seed", i, e);
      }
    }
    return frames;
  }
  async function handleGenerate() {
    if (!prompt.trim()) return;
    setError(null);
    setLoading(true);
    setScenes(null);
    setTotalFrames(null);
    try {
      let storyText;
      try {
        const chatRes = await websim.chat.completions.create({
          messages: [
            {
              role: "system",
              content: "You are a concise scene generator. Given a short user prompt, return 1-3 short sentences that each describe a distinct visual scene suitable for frame-by-frame image-to-image generation."
            },
            { role: "user", content: prompt }
          ]
        });
        storyText = chatRes && chatRes.content || prompt;
      } catch (e) {
        storyText = prompt;
      }
      let sentences = splitToSentences(storyText).slice(0, 3);
      if (sentences.length === 0) sentences = [prompt];
      const characterSpec = buildCharacterSpec(prompt);
      const overlayDataUrl = await requestOverlayFromMotif(characterSpec);
      const scenePromises = sentences.map(async (sentence, idx) => {
        const visualPrompt = `${sentence} -- cinematic background, portrait 9:16, high detail, realistic color. Composite the provided transparent PNG overlay at center (same position each frame) and generate natural motion in the background and slight pose variations while preserving lighting and markings.`;
        const frames = await generateFrameSequenceWithOverlay(visualPrompt, overlayDataUrl, FRAMES_PER_SCENE);
        const durationFrames = Math.max(1, frames.length * FRAME_HOLD_FRAMES);
        return {
          id: `scene-${idx}`,
          frames,
          // array of image URLs (object URLs)
          durationFrames
        };
      });
      const resolvedScenes = await Promise.all(scenePromises);
      const sumFrames = resolvedScenes.reduce((s, sc) => s + (sc.durationFrames || 0), 0) || Math.round(3 * PLAYER_FPS);
      setScenes(resolvedScenes);
      setTotalFrames(sumFrames);
    } catch (err) {
      console.error(err);
      setError("FAILED. GIVE NEW PROMPT THAT ISN'T ILLEGAL");
    } finally {
      setLoading(false);
    }
  }
  return /* @__PURE__ */ jsxDEV("div", { className: "app", role: "main", children: [
    /* @__PURE__ */ jsxDEV("div", { className: "controls", children: [
      /* @__PURE__ */ jsxDEV(
        "textarea",
        {
          className: "prompt",
          placeholder: "Enter a prompt (e.g. 'baby hamster dancing')",
          value: prompt,
          onChange: (e) => setPrompt(e.target.value)
        },
        void 0,
        false,
        {
          fileName: "<stdin>",
          lineNumber: 249,
          columnNumber: 9
        },
        this
      ),
      /* @__PURE__ */ jsxDEV("div", { style: { display: "flex", gap: 8 }, children: [
        /* @__PURE__ */ jsxDEV(
          "button",
          {
            className: "button",
            onClick: handleGenerate,
            disabled: loading || !prompt.trim(),
            children: loading ? "Generating..." : "Generate Video"
          },
          void 0,
          false,
          {
            fileName: "<stdin>",
            lineNumber: 256,
            columnNumber: 11
          },
          this
        ),
        /* @__PURE__ */ jsxDEV("div", { style: { display: "flex", alignItems: "center" }, children: /* @__PURE__ */ jsxDEV("span", { className: "small", children: error ?? "" }, void 0, false, {
          fileName: "<stdin>",
          lineNumber: 264,
          columnNumber: 13
        }, this) }, void 0, false, {
          fileName: "<stdin>",
          lineNumber: 263,
          columnNumber: 11
        }, this)
      ] }, void 0, true, {
        fileName: "<stdin>",
        lineNumber: 255,
        columnNumber: 9
      }, this)
    ] }, void 0, true, {
      fileName: "<stdin>",
      lineNumber: 248,
      columnNumber: 7
    }, this),
    /* @__PURE__ */ jsxDEV("div", { className: "playerWrap", "aria-live": "polite", children: scenes && totalFrames ? /* @__PURE__ */ jsxDEV(
      Player,
      {
        component: MyComposition,
        durationInFrames: totalFrames,
        fps: PLAYER_FPS,
        compositionWidth: 1080,
        compositionHeight: 1920,
        loop: true,
        controls: true,
        inputProps: { scenes, frameHoldFrames: FRAME_HOLD_FRAMES, promptText: prompt },
        style: { width: "100%", height: "100%" }
      },
      void 0,
      false,
      {
        fileName: "<stdin>",
        lineNumber: 271,
        columnNumber: 11
      },
      this
    ) : /* @__PURE__ */ jsxDEV("div", { style: { padding: 12, textAlign: "center" }, children: /* @__PURE__ */ jsxDEV("div", { className: "notice", children: loading ? "Generating frame sequences\u2026 This may take a while." : error ? "FAILED. GIVE NEW PROMPT THAT ISN'T ILLEGAL" : "No video yet. Enter a prompt and press Generate." }, void 0, false, {
      fileName: "<stdin>",
      lineNumber: 284,
      columnNumber: 13
    }, this) }, void 0, false, {
      fileName: "<stdin>",
      lineNumber: 283,
      columnNumber: 11
    }, this) }, void 0, false, {
      fileName: "<stdin>",
      lineNumber: 269,
      columnNumber: 7
    }, this)
  ] }, void 0, true, {
    fileName: "<stdin>",
    lineNumber: 247,
    columnNumber: 5
  }, this);
}
export {
  App as default
};
