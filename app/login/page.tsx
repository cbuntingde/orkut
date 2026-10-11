import Header from "@/components/Header";
import AuthForm from "@/components/AuthForm";

export default function LoginPage() {
  return (
    <div className="flex min-h-full flex-1 flex-col">
      <Header />
      <main className="mx-auto w-full max-w-md flex-1 p-4">
        <div className="orkut-box">
          <div className="orkut-box-header">login to orkut</div>
          <AuthForm mode="login" />
        </div>
      </main>
    </div>
  );
}
