import Header from '@/components/Header';
import Visualizer from '@/components/Visualizer';

export default function Home() {
  return (
    <main className="min-h-screen flex flex-col page-shell">
      <Header />
      <div className="flex-1">
        <Visualizer />
      </div>

      <footer className="py-8 px-6 text-center text-gray-500 text-sm border-t border-orange-100 bg-[#FDFBF7]">
        <p>© {new Date().getFullYear()} Vloerenconcurrent. Alle rechten voorbehouden.</p>
      </footer>
    </main>
  );
}
