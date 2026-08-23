'use client';

import { useEffect, useState } from 'react';
import { PlatformBadge } from './PlatformBadge';

type EventItem = {
  id: number;
  platform: string;
  tag: string;
  title: string;
  accent: string;
};

export function EventCarousel({ events }: { events: EventItem[] }) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const id = setInterval(() => {
      setIndex((prev) => (prev + 1) % events.length);
    }, 5000);
    return () => clearInterval(id);
  }, [events.length]);

  const current = events[index];

  return (
    <div className="event-carousel">
      <div className="event-carousel-track" key={current.id}>
        <span className="event-carousel-tag" style={{ background: current.accent }}>
          <PlatformBadge name={current.platform} size={16} />
          {current.tag}
        </span>
        <p className="event-carousel-title">{current.title}</p>
      </div>

      <div className="event-carousel-controls">
        <button
          type="button"
          aria-label="Previous"
          onClick={() => setIndex((prev) => (prev - 1 + events.length) % events.length)}
        >
          ‹
        </button>
        <div className="event-carousel-dots">
          {events.map((event, i) => (
            <button
              key={event.id}
              type="button"
              aria-label={`Go to slide ${i + 1}`}
              className={i === index ? 'active' : ''}
              onClick={() => setIndex(i)}
            />
          ))}
        </div>
        <button
          type="button"
          aria-label="Next"
          onClick={() => setIndex((prev) => (prev + 1) % events.length)}
        >
          ›
        </button>
      </div>
    </div>
  );
}
