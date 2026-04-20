import { jsxDEV } from "react/jsx-dev-runtime";
import React from "react";
import { AbsoluteFill, Img, Sequence, useCurrentFrame, interpolate, useVideoConfig } from "remotion";
const MyComposition = ({ scenes = [], frameHoldFrames = 15, promptText = "" }) => {
  const { fps } = useVideoConfig();
  if (!scenes || scenes.length === 0) {
    return /* @__PURE__ */ jsxDEV(AbsoluteFill, { style: { background: "#000", justifyContent: "center", alignItems: "center" }, children: /* @__PURE__ */ jsxDEV("div", { style: { color: "#fff" }, children: promptText }, void 0, false, {
      fileName: "<stdin>",
      lineNumber: 17,
      columnNumber: 9
    }) }, void 0, false, {
      fileName: "<stdin>",
      lineNumber: 16,
      columnNumber: 7
    });
  }
  let offset = 0;
  return /* @__PURE__ */ jsxDEV(AbsoluteFill, { style: { background: "#000" }, children: scenes.map((scene, idx) => {
    const durationInFrames = scene.durationFrames || Math.round(3 * fps);
    const from = offset;
    offset += durationInFrames;
    return /* @__PURE__ */ jsxDEV(Sequence, { from, durationInFrames, children: /* @__PURE__ */ jsxDEV(SceneFrameCycler, { scene, duration: durationInFrames, frameHoldFrames }, void 0, false, {
      fileName: "<stdin>",
      lineNumber: 31,
      columnNumber: 13
    }) }, scene.id || idx, false, {
      fileName: "<stdin>",
      lineNumber: 30,
      columnNumber: 11
    });
  }) }, void 0, false, {
    fileName: "<stdin>",
    lineNumber: 24,
    columnNumber: 5
  });
};
const SceneFrameCycler = ({ scene, duration, frameHoldFrames }) => {
  const frame = useCurrentFrame();
  const fadeInEnd = Math.max(1, Math.floor(duration * 0.12));
  const fadeOutStart = Math.max(1, Math.floor(duration * 0.88));
  const opacity = interpolate(
    frame,
    [0, fadeInEnd, fadeOutStart, duration - 1],
    [0, 1, 1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );
  const frames = Array.isArray(scene.frames) && scene.frames.length ? scene.frames : [];
  const frameIndex = frames.length ? Math.min(frames.length - 1, Math.floor(frame / frameHoldFrames)) : 0;
  const imageUrl = frames[frameIndex];
  return /* @__PURE__ */ jsxDEV(AbsoluteFill, { style: { justifyContent: "center", alignItems: "center", opacity }, children: imageUrl ? /* @__PURE__ */ jsxDEV(Img, { src: imageUrl, style: { position: "absolute", width: "100%", height: "100%", objectFit: "cover" } }, void 0, false, {
    fileName: "<stdin>",
    lineNumber: 62,
    columnNumber: 9
  }) : /* @__PURE__ */ jsxDEV(AbsoluteFill, { style: { background: "#0b0b0b" } }, void 0, false, {
    fileName: "<stdin>",
    lineNumber: 64,
    columnNumber: 9
  }) }, void 0, false, {
    fileName: "<stdin>",
    lineNumber: 60,
    columnNumber: 5
  });
};
export {
  MyComposition
};
