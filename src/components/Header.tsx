import Image from 'next/image';
import Link from 'next/link';

export default function Header() {
  return (
    <header className="w-full bg-[#FDFBF7] border-b border-orange-100 py-4 px-6 md:px-12 flex items-center justify-between sticky top-0 z-50">
      <div className="flex items-center">
        <Link href="/">
          <Image 
            src="https://vloerenconcurrent.com/wp-content/uploads/Logo-Vloerenconcurrent-web.svg" 
            alt="Vloerenconcurrent Logo" 
            width={200} 
            height={50}
            priority
            className="h-10 w-auto"
          />
        </Link>
      </div>
    </header>
  );
}
