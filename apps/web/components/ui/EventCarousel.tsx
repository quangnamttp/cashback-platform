'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

type EventItem = {
  id: number;
  src: string;
  alt: string;
};

const SLIDE_DURATION_MS = 5000;

export function EventCarousel({ events }: { events: EventItem[] }) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const id = setInterval(() => {
      setIndex((prev) => (prev + 1) % events.length);
    }, SLIDE_DURATION_MS);
    return () => clearInterval(id);
  }, [events.length]);

  const current = events[index];
  const goPrev = () => setIndex((prev) => (prev - 1 + events.length) % events.length);
  const goNext = () => setIndex((prev) => (prev + 1) % events.length);

  return (
    <div className="event-carousel">
      <div className="event-carousel-backdrop" style={{ backgroundImage: `url(${current.src})` }} />
      <div className="event-carousel-backdrop-shade" />

      <button type="button" className="event-carousel-nav prev" aria-label="Previous" onClick={goPrev}>
        ‹
      </button>

      <Link href="/get-cashback-link" className="event-carousel-slide" key={current.id}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={current.src} alt={current.alt} className="event-carousel-img" />
      </Link>

      <button type="button" className="event-carousel-nav next" aria-label="Next" onClick={goNext}>
        ›
      </button>

      <div className="event-carousel-dots">
        {events.map((event, i) => (
          <button
            key={event.id}
            type="button"
            aria-label={`Go to slide ${i + 1}`}
            className={i === index ? 'active' : ''}
            onClick={() => setIndex(i)}
          >
            {i === index && <span key={current.id} className="event-carousel-dot-progress" />}
          </button>
        ))}
      </div>
    </div>
  );
}
