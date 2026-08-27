import ContentAudienceChooser from "@/components/ContentAudienceChooser";

export default function CreatePostLayout({ children }) {
  return (
    <>
      <ContentAudienceChooser target="post" />
      {children}
    </>
  );
}
