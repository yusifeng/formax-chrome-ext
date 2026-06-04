import path from "node:path";
import { browserClick, browserOpenUrl, browserStartSession, browserUploadFile } from "./browserTools.js";
function print(title, value) {
    console.log(`\n# ${title}`);
    console.log(JSON.stringify(value, null, 2));
}
function findFileInput(elements) {
    return elements.find((element) => element.role === "input:file");
}
function findUploadTrigger(elements) {
    return elements.find((element) => {
        const label = element.label.toLowerCase();
        return (label.includes("upload") ||
            label.includes("上传") ||
            label.includes("按图") ||
            label.includes("image") ||
            label.includes("lens") ||
            label.includes("computer") ||
            label.includes("文件"));
    });
}
const filePath = path.resolve(process.env.IMAGE_PATH || "fixtures/red-test.png");
const sessionEnvelope = await browserStartSession({
    active: true
});
const session = sessionEnvelope.result;
print("session", session);
let openedEnvelope = await browserOpenUrl({
    sessionId: session.sessionId,
    url: "https://lens.google.com/upload"
});
let observation = openedEnvelope.result;
print("opened", {
    url: observation.url,
    title: observation.title,
    elements: observation.elements.slice(0, 20)
});
let fileInput = findFileInput(observation.elements);
if (!fileInput) {
    const uploadTrigger = findUploadTrigger(observation.elements);
    if (uploadTrigger) {
        const clickedEnvelope = await browserClick({
            sessionId: session.sessionId,
            ref: uploadTrigger.ref,
            waitMs: 1000
        });
        observation = clickedEnvelope.result;
        print("afterUploadTriggerClick", {
            url: observation.url,
            title: observation.title,
            elements: observation.elements.slice(0, 30)
        });
        fileInput = findFileInput(observation.elements);
    }
}
if (!fileInput) {
    throw new Error("Could not find input[type=file] on Google Lens upload page");
}
print("fileInput", fileInput);
const uploadedEnvelope = await browserUploadFile({
    sessionId: session.sessionId,
    ref: fileInput.ref,
    filePath,
    waitMs: 3000
});
const uploaded = uploadedEnvelope.result;
print("uploaded", {
    url: uploaded.url,
    title: uploaded.title,
    text: uploaded.text.slice(0, 1000),
    elements: uploaded.elements.slice(0, 30)
});
