"use client";

import VideoUploader from "../../../components/videouploader";

export default function VideoEditor({ file, onSave }) {
  return (
    <div className="mx-auto max-w-6xl p-4">
      <h1 className="mb-4 text-2xl font-bold">Create New Post</h1>
      <VideoUploader file={file} onSave={onSave} />
    </div>
  );
}
