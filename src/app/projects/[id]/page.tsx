import { redirect } from "next/navigation";

export default async function ProjectIndex({ params }: PageProps<"/projects/[id]">) {
  const { id } = await params;
  redirect(`/projects/${id}/script`);
}
