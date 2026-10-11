import Header from "@/components/Header";
import EditProfileForm from "@/components/EditProfileForm";
import { requireUser } from "@/lib/auth";

export default async function EditProfilePage() {
  const me = await requireUser();
  const initial: Record<string, string | null> = {
    status: me.status, relationship: me.relationship, city: me.city, country: me.country,
    about: me.about, interests: me.interests, music: me.music, movies: me.movies, books: me.books, avatarUrl: me.avatarUrl,
  };
  return (
    <div className="flex min-h-full flex-1 flex-col">
      <Header />
      <main className="mx-auto w-full max-w-xl flex-1 p-4">
        <div className="orkut-box">
          <div className="orkut-box-header">edit profile</div>
          <EditProfileForm initial={initial} />
        </div>
      </main>
    </div>
  );
}
