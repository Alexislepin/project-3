import Hero from '@/components/Landing/Hero';
import PhoneMockup from '@/components/Landing/PhoneMockup';
import Marquee from '@/components/Landing/Marquee';
import Features from '@/components/Landing/Features';
import Testimonials from '@/components/Landing/Testimonials';
import Footer from '@/components/Landing/Footer';

export default function Home() {
  return (
    <main className="min-h-screen">
      <Hero />
      <PhoneMockup />
      <Marquee />
      <Features />
      <Testimonials />
      <Footer />
    </main>
  );
}










