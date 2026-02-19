import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import heroBg from '@/assets/hero-bg.png';
import logoImg from '@/assets/cricstreampro.png';
import {
  Trophy, Zap, Users, BarChart3, Star, Check, MessageCircle,
  Monitor, Tv2, Radio, Video
} from 'lucide-react';
import { useState } from 'react';

const plans = {
  daily: [
    {
      name: 'Basic',
      price: '৳49',
      period: '/দিন',
      highlight: false,
      features: ['১টি টুর্নামেন্ট', '৩টি ম্যাচ', 'লাইভ স্কোরবোর্ড', 'OBS/PRISM সাপোর্ট'],
    },
    {
      name: 'Pro',
      price: '৳99',
      period: '/দিন',
      highlight: true,
      features: ['আনলিমিটেড টুর্নামেন্ট', 'আনলিমিটেড ম্যাচ', 'সব স্কোরবোর্ড থিম', 'লাইভ সফটওয়্যার সাপোর্ট', 'প্রায়রিটি সাপোর্ট'],
    },
    {
      name: 'Enterprise',
      price: '৳199',
      period: '/দিন',
      highlight: false,
      features: ['সব Pro সুবিধা', 'কাস্টম ব্র্যান্ডিং', 'ডেডিকেটেড সাপোর্ট', 'মাল্টি-ইউজার অ্যাক্সেস'],
    },
  ],
  monthly: [
    {
      name: 'Basic',
      price: '৳799',
      period: '/মাস',
      highlight: false,
      features: ['১টি টুর্নামেন্ট', '৩টি ম্যাচ', 'লাইভ স্কোরবোর্ড', 'OBS/PRISM সাপোর্ট'],
    },
    {
      name: 'Pro',
      price: '৳1,499',
      period: '/মাস',
      highlight: true,
      features: ['আনলিমিটেড টুর্নামেন্ট', 'আনলিমিটেড ম্যাচ', 'সব স্কোরবোর্ড থিম', 'লাইভ সফটওয়্যার সাপোর্ট', 'প্রায়রিটি সাপোর্ট'],
    },
    {
      name: 'Enterprise',
      price: '৳2,999',
      period: '/মাস',
      highlight: false,
      features: ['সব Pro সুবিধা', 'কাস্টম ব্র্যান্ডিং', 'ডেডিকেটেড সাপোর্ট', 'মাল্টি-ইউজার অ্যাক্সেস'],
    },
  ],
  yearly: [
    {
      name: 'Basic',
      price: '৳5,999',
      period: '/বছর',
      highlight: false,
      badge: '৩৭% সাশ্রয়',
      features: ['১টি টুর্নামেন্ট', '৩টি ম্যাচ', 'লাইভ স্কোরবোর্ড', 'OBS/PRISM সাপোর্ট'],
    },
    {
      name: 'Pro',
      price: '৳9,999',
      period: '/বছর',
      highlight: true,
      badge: '৪৪% সাশ্রয়',
      features: ['আনলিমিটেড টুর্নামেন্ট', 'আনলিমিটেড ম্যাচ', 'সব স্কোরবোর্ড থিম', 'লাইভ সফটওয়্যার সাপোর্ট', 'প্রায়রিটি সাপোর্ট'],
    },
    {
      name: 'Enterprise',
      price: '৳19,999',
      period: '/বছর',
      highlight: false,
      badge: '৪৪% সাশ্রয়',
      features: ['সব Pro সুবিধা', 'কাস্টম ব্র্যান্ডিং', 'ডেডিকেটেড সাপোর্ট', 'মাল্টি-ইউজার অ্যাক্সেস'],
    },
  ],
};

const reviews = [
  {
    name: 'রাফিউল ইসলাম',
    location: 'ঢাকা',
    rating: 5,
    text: 'অসাধারণ সিস্টেম! আমাদের লোকাল টুর্নামেন্টে OBS দিয়ে লাইভ স্কোর দেখানো অনেক সহজ হয়ে গেছে। সবাই মুগ্ধ হয়ে গেছে।',
  },
  {
    name: 'তানভীর আহমেদ',
    location: 'চট্টগ্রাম',
    rating: 5,
    text: 'PRISM Live দিয়ে স্কোরবোর্ড সেটআপ করতে মাত্র ৫ মিনিট লাগলো। এত সহজ টুল আগে কখনো দেখিনি। দারুণ কাজ!',
  },
  {
    name: 'মাহফুজুর রহমান',
    location: 'সিলেট',
    rating: 5,
    text: 'বাংলাদেশে এই ধরনের প্রফেশনাল ক্রিকেট স্কোরিং টুল খুবই দরকার ছিল। রিয়েল-টাইম আপডেট একদম পারফেক্ট।',
  },
  {
    name: 'সাবিনা আক্তার',
    location: 'রাজশাহী',
    rating: 4,
    text: 'আমাদের স্কুলের বার্ষিক ক্রিকেট টুর্নামেন্টে ব্যবহার করেছি। ব্যবহার করা অনেক সহজ এবং স্কোরবোর্ড দেখতে প্রফেশনাল লাগে।',
  },
  {
    name: 'কামরুজ্জামান',
    location: 'খুলনা',
    rating: 5,
    text: 'vMix এর সাথে পারফেক্টলি কাজ করে। আমাদের YouTube লাইভে দর্শকরা অনেক প্রশংসা করেছে স্কোরবোর্ডের জন্য।',
  },
  {
    name: 'জহিরুল হক',
    location: 'ময়মনসিংহ',
    rating: 5,
    text: 'দাম অনেক সাশ্রয়ী। প্রতিটি ফিচার কাজে লাগে। বিশেষ করে উইকেট ও রানের রিয়েল-টাইম আপডেট অসাধারণ।',
  },
];

const softwareList = [
  { name: 'vMix', icon: Monitor, desc: 'Windows লাইভ প্রোডাকশন' },
  { name: 'OBS Studio', icon: Tv2, desc: 'ফ্রি ওপেন-সোর্স স্ট্রিমিং' },
  { name: 'PRISM Live', icon: Radio, desc: 'মোবাইল লাইভ স্ট্রিমিং' },
  { name: 'Camera Fi Live', icon: Video, desc: 'Android লাইভ স্ট্রিমিং' },
];

const Landing = () => {
  const [billingCycle, setBillingCycle] = useState<'daily' | 'monthly' | 'yearly'>('monthly');

  return (
    <div className="min-h-screen bg-background relative">

      {/* WhatsApp Floating Button */}
      <a
        href="https://wa.me/8801793645711"
        target="_blank"
        rel="noopener noreferrer"
        className="fixed bottom-6 right-6 z-50 flex items-center gap-2 bg-[hsl(142_76%_36%)] hover:bg-[hsl(142_76%_30%)] text-primary-foreground rounded-full shadow-glow px-4 py-3 transition-all duration-300 hover:scale-105 group"
        aria-label="WhatsApp এ যোগাযোগ করুন"
      >
        <svg viewBox="0 0 24 24" className="h-6 w-6 fill-current flex-shrink-0" xmlns="http://www.w3.org/2000/svg">
          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
        </svg>
        <span className="font-display text-sm font-semibold hidden sm:inline">WhatsApp করুন</span>
      </a>

      {/* Nav */}
      <nav className="fixed top-0 w-full z-50 bg-background/80 backdrop-blur-md border-b border-border">
        <div className="container mx-auto flex items-center justify-between h-16 px-4">
          <Link to="/" className="flex items-center gap-2">
            <img src={logoImg} alt="CricStream Pro" className="h-10 object-contain" />
          </Link>
          <div className="flex items-center gap-3">
            <Link to="/auth">
              <Button variant="ghost" size="sm">Login</Button>
            </Link>
            <Link to="/auth">
              <Button size="sm">Get Started</Button>
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative min-h-screen flex items-center justify-center overflow-hidden">
        <div className="absolute inset-0">
          <img src={heroBg} alt="Cricket Stadium" className="w-full h-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-b from-background/70 via-background/80 to-background" />
        </div>
        <div className="relative z-10 container mx-auto px-4 text-center">
          <div className="inline-flex items-center gap-2 bg-primary/10 border border-primary/30 rounded-full px-4 py-2 mb-6">
            <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
            <span className="text-primary text-sm font-medium font-display tracking-wide">বাংলাদেশের #১ ক্রিকেট স্কোরিং প্ল্যাটফর্ম</span>
          </div>
          <div className="flex justify-center mb-6">
            <img src={logoImg} alt="CricStream Pro" className="h-32 md:h-44 object-contain drop-shadow-2xl" />
          </div>
          <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto mb-8">
            প্রফেশনাল ক্রিকেট স্কোরিং এখন সহজ। টুর্নামেন্ট তৈরি করুন, ম্যাচ পরিচালনা করুন এবং লাইভ স্কোরবোর্ড শেয়ার করুন — সব ব্রাউজার থেকে।
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link to="/auth">
              <Button size="lg" className="text-lg px-8 py-6 font-display tracking-wide">
                <Zap className="mr-2 h-5 w-5" />
                স্কোরিং শুরু করুন
              </Button>
            </Link>
            <a href="#pricing">
              <Button size="lg" variant="outline" className="text-lg px-8 py-6 font-display tracking-wide">
                মূল্য দেখুন
              </Button>
            </a>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-24 bg-background">
        <div className="container mx-auto px-4">
          <div className="text-center mb-16">
            <h2 className="font-display text-3xl md:text-4xl font-bold mb-4">
              Everything You Need
            </h2>
            <p className="text-muted-foreground max-w-xl mx-auto">যা যা দরকার সব একটি প্ল্যাটফর্মে</p>
          </div>
          <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
            {[
              { icon: Trophy, title: 'Tournaments', desc: 'একাধিক টুর্নামেন্ট তৈরি ও পরিচালনা করুন সহজে।' },
              { icon: Zap, title: 'Live Scoring', desc: 'বল-বাই-বল স্কোরিং, রিয়েল-টাইম আপডেট ও আনডু সুবিধা।' },
              { icon: BarChart3, title: 'Stats & Display', desc: 'সুন্দর স্কোরবোর্ড ডিসপ্লে এবং বিস্তারিত পরিসংখ্যান।' },
            ].map((f) => (
              <div key={f.title} className="gradient-card rounded-xl p-8 border border-border shadow-card hover:shadow-glow transition-shadow duration-300">
                <f.icon className="h-10 w-10 text-primary mb-4" />
                <h3 className="font-display text-xl font-semibold mb-2">{f.title}</h3>
                <p className="text-muted-foreground">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Compatible With */}
      <section className="py-20 bg-card border-y border-border">
        <div className="container mx-auto px-4">
          <div className="text-center mb-12">
            <span className="text-primary text-sm font-display font-semibold tracking-widest uppercase">সরাসরি সংযোগ</span>
            <h2 className="font-display text-3xl md:text-4xl font-bold mt-2 mb-3">Compatible With</h2>
            <p className="text-muted-foreground max-w-lg mx-auto">আপনার পছন্দের যেকোনো লাইভ স্ট্রিমিং সফটওয়্যারের সাথে CricStream Pro সরাসরি কাজ করে</p>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 max-w-4xl mx-auto">
            {softwareList.map((sw) => (
              <div key={sw.name} className="gradient-card border border-border rounded-xl p-6 flex flex-col items-center text-center hover:border-primary/40 hover:shadow-glow transition-all duration-300 group">
                <div className="w-14 h-14 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center mb-4 group-hover:bg-primary/20 transition-colors">
                  <sw.icon className="h-7 w-7 text-primary" />
                </div>
                <h3 className="font-display text-lg font-semibold mb-1">{sw.name}</h3>
                <p className="text-muted-foreground text-xs">{sw.desc}</p>
              </div>
            ))}
          </div>
          <div className="text-center mt-10">
            <p className="text-muted-foreground text-sm">Browser Source URL কপি করুন → আপনার সফটওয়্যারে পেস্ট করুন → লাইভ শুরু করুন 🎉</p>
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="py-24 bg-background">
        <div className="container mx-auto px-4">
          <div className="text-center mb-12">
            <span className="text-primary text-sm font-display font-semibold tracking-widest uppercase">সাশ্রয়ী মূল্য</span>
            <h2 className="font-display text-3xl md:text-4xl font-bold mt-2 mb-3">সাবস্ক্রিপশন প্ল্যান</h2>
            <p className="text-muted-foreground max-w-lg mx-auto">আপনার প্রয়োজন অনুযায়ী পরিকল্পনা বেছে নিন</p>
          </div>

          {/* Billing Toggle */}
          <div className="flex items-center justify-center gap-2 mb-12">
            {(['daily', 'monthly', 'yearly'] as const).map((cycle) => (
              <button
                key={cycle}
                onClick={() => setBillingCycle(cycle)}
                className={`px-5 py-2 rounded-full font-display text-sm font-semibold transition-all duration-200 ${
                  billingCycle === cycle
                    ? 'bg-primary text-primary-foreground shadow-glow'
                    : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'
                }`}
              >
                {cycle === 'daily' ? 'দৈনিক' : cycle === 'monthly' ? 'মাসিক' : 'বার্ষিক'}
                {cycle === 'yearly' && billingCycle !== 'yearly' && (
                  <span className="ml-2 text-xs bg-accent text-accent-foreground rounded-full px-2 py-0.5">সাশ্রয়</span>
                )}
              </button>
            ))}
          </div>

          {/* Plan Cards */}
          <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
            {plans[billingCycle].map((plan) => (
              <div
                key={plan.name}
                className={`relative rounded-2xl p-8 border transition-all duration-300 ${
                  plan.highlight
                    ? 'border-primary bg-primary/5 shadow-glow scale-105'
                    : 'border-border gradient-card hover:border-primary/30 hover:shadow-glow'
                }`}
              >
                {plan.highlight && (
                  <div className="absolute -top-4 left-1/2 -translate-x-1/2">
                    <span className="bg-primary text-primary-foreground font-display text-xs font-bold px-4 py-1.5 rounded-full tracking-wide shadow-glow">
                      সবচেয়ে জনপ্রিয়
                    </span>
                  </div>
                )}
                {'badge' in plan && plan.badge && (
                  <div className="absolute top-4 right-4">
                    <span className="bg-accent text-accent-foreground font-display text-xs font-bold px-3 py-1 rounded-full">
                      {plan.badge as string}
                    </span>
                  </div>
                )}
                <h3 className="font-display text-xl font-bold mb-2">{plan.name}</h3>
                <div className="flex items-end gap-1 mb-6">
                  <span className="font-display text-4xl font-bold text-gradient">{plan.price}</span>
                  <span className="text-muted-foreground mb-1">{plan.period}</span>
                </div>
                <ul className="space-y-3 mb-8">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-center gap-3 text-sm">
                      <div className="w-5 h-5 rounded-full bg-primary/15 flex items-center justify-center flex-shrink-0">
                        <Check className="h-3 w-3 text-primary" />
                      </div>
                      <span className="text-foreground/90">{feature}</span>
                    </li>
                  ))}
                </ul>
                <Link to="/auth">
                  <Button
                    className={`w-full font-display tracking-wide ${plan.highlight ? '' : 'variant-outline'}`}
                    variant={plan.highlight ? 'default' : 'outline'}
                  >
                    শুরু করুন
                  </Button>
                </Link>
              </div>
            ))}
          </div>
          <p className="text-center text-muted-foreground text-sm mt-8">
            প্রশ্ন আছে?{' '}
            <a href="https://wa.me/8801793645711" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
              WhatsApp-এ যোগাযোগ করুন
            </a>
          </p>
        </div>
      </section>

      {/* Reviews */}
      <section className="py-24 bg-card border-t border-border">
        <div className="container mx-auto px-4">
          <div className="text-center mb-12">
            <span className="text-primary text-sm font-display font-semibold tracking-widest uppercase">ব্যবহারকারীদের মতামত</span>
            <h2 className="font-display text-3xl md:text-4xl font-bold mt-2 mb-3">সবাই কী বলছে?</h2>
            <p className="text-muted-foreground">সারা বাংলাদেশ থেকে ক্রিকেট প্রেমীদের রিভিউ</p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-6xl mx-auto">
            {reviews.map((review, i) => (
              <div key={i} className="gradient-card border border-border rounded-xl p-6 hover:border-primary/30 hover:shadow-glow transition-all duration-300">
                <div className="flex items-center gap-1 mb-3">
                  {Array.from({ length: 5 }).map((_, j) => (
                    <Star
                      key={j}
                      className={`h-4 w-4 ${j < review.rating ? 'fill-accent text-accent' : 'text-muted'}`}
                    />
                  ))}
                </div>
                <p className="text-foreground/85 text-sm leading-relaxed mb-4">"{review.text}"</p>
                <div className="flex items-center gap-3 pt-3 border-t border-border">
                  <div className="w-9 h-9 rounded-full bg-primary/15 border border-primary/30 flex items-center justify-center">
                    <span className="font-display text-primary font-bold text-sm">{review.name[0]}</span>
                  </div>
                  <div>
                    <p className="font-display font-semibold text-sm">{review.name}</p>
                    <p className="text-muted-foreground text-xs">{review.location}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Banner */}
      <section className="py-20 bg-background">
        <div className="container mx-auto px-4">
          <div className="relative rounded-2xl overflow-hidden border border-primary/30 bg-primary/5 p-12 text-center shadow-glow">
            <div className="absolute inset-0 bg-gradient-to-r from-primary/5 via-transparent to-accent/5 pointer-events-none" />
            <Trophy className="h-12 w-12 text-primary mx-auto mb-4" />
            <h2 className="font-display text-3xl md:text-4xl font-bold mb-4">এখনই শুরু করুন</h2>
            <p className="text-muted-foreground max-w-lg mx-auto mb-8">
              আপনার পরবর্তী টুর্নামেন্টকে প্রফেশনাল করে তুলুন। CricStream Pro দিয়ে লাইভ স্কোরিং শুরু করুন আজই।
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link to="/auth">
                <Button size="lg" className="font-display tracking-wide px-10">
                  <Zap className="mr-2 h-5 w-5" />
                  ফ্রি শুরু করুন
                </Button>
              </Link>
              <a href="https://wa.me/8801793645711" target="_blank" rel="noopener noreferrer">
                <Button size="lg" variant="outline" className="font-display tracking-wide px-10">
                  <svg viewBox="0 0 24 24" className="h-5 w-5 mr-2 fill-current" xmlns="http://www.w3.org/2000/svg">
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                  </svg>
                  WhatsApp করুন
                </Button>
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border py-10 bg-card">
        <div className="container mx-auto px-4">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <img src={logoImg} alt="CricStream Pro" className="h-10 object-contain" />
            </div>
            <p className="text-muted-foreground text-sm text-center">
              © ২০২৬ CricStream Pro। ক্রিকেট প্রেমীদের জন্য তৈরি 🏏
            </p>
            <a
              href="https://wa.me/8801793645711"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 text-primary hover:text-primary/80 transition-colors text-sm font-medium"
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current" xmlns="http://www.w3.org/2000/svg">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
              </svg>
              +8801793645711
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Landing;
