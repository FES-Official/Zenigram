import ContentAudienceChooser from "@/components/ContentAudienceChooser";

export default function CreateClipLayout({ children }) {
  return (
    <>
      <ContentAudienceChooser target="clip" />
      {children}
    </>
  );
}
