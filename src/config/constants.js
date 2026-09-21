// Single source of truth for enum values shared by the DB schema, validators and controllers.

export const USER_ROLES = ["employee", "admin"];
export const USER_STATUSES = ["active", "inactive"];
export const ROOM_STATUSES = ["available", "occupied", "maintenance"];
export const RESERVATION_STATUSES = ["upcoming", "completed", "cancelled"];

// Mirrors the facilities catalogue used by the front end filters.
export const FACILITIES = [
  "4K Display",
  "Video Conferencing",
  "Whiteboard",
  "Wireless Presentation",
  "Sound System",
  "Natural Light",
  "Standing Desks",
  "Phone Line",
];

export const DEFAULT_ROOM_IMAGE =
  "https://images.unsplash.com/photo-1497366216548-37526070297c?q=80&w=1200&auto=format&fit=crop";
