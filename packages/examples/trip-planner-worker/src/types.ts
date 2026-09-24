/**
 * Type definitions for Trip Planner Worker
 * Demonstrates Nzovu-based trip planning orchestration
 */

/**
 * Trip request from user
 */
export interface TripRequest {
  destination: string;
  startDate: string;
  endDate: string;
  travelers: number;
  budget: number;
  preferences?: {
    activities?: string[];
    accommodationType?: "hotel" | "hostel" | "airbnb" | "resort";
    transportation?: "flight" | "train" | "car" | "mixed";
  };
}

/**
 * Generated trip plan
 */
export interface TripPlan {
  tripId: string;
  destination: string;
  itinerary: DayPlan[];
  accommodations: Accommodation[];
  transportation: Transportation[];
  estimatedCost: number;
  generatedAt: string;
}

export interface DayPlan {
  day: number;
  date: string;
  activities: Activity[];
  meals: Meal[];
}

export interface Activity {
  name: string;
  duration: string;
  cost: number;
  description: string;
}

export interface Meal {
  type: "breakfast" | "lunch" | "dinner";
  venue: string;
  estimatedCost: number;
}

export interface Accommodation {
  name: string;
  type: string;
  checkIn: string;
  checkOut: string;
  nightlyRate: number;
  totalCost: number;
}

export interface Transportation {
  type: string;
  from: string;
  to: string;
  departureTime: string;
  arrivalTime: string;
  cost: number;
}

/**
 * Task types for trip planning operations
 */
export enum TaskType {
  PLAN_TRIP = "plan_trip",
  BOOK_ACCOMMODATION = "book_accommodation",
  ARRANGE_TRANSPORTATION = "arrange_transportation",
  SUGGEST_ACTIVITIES = "suggest_activities",
  CALCULATE_BUDGET = "calculate_budget",
}

/**
 * Task payload union type
 */
export type TaskPayload =
  | PlanTripPayload
  | BookAccommodationPayload
  | ArrangeTransportationPayload
  | SuggestActivitiesPayload
  | CalculateBudgetPayload;

export interface PlanTripPayload {
  type: TaskType.PLAN_TRIP;
  request: TripRequest;
}

export interface BookAccommodationPayload {
  type: TaskType.BOOK_ACCOMMODATION;
  tripId: string;
  destination: string;
  checkIn: string;
  checkOut: string;
  travelers: number;
  budget: number;
}

export interface ArrangeTransportationPayload {
  type: TaskType.ARRANGE_TRANSPORTATION;
  tripId: string;
  from: string;
  to: string;
  date: string;
  travelers: number;
  budget: number;
}

export interface SuggestActivitiesPayload {
  type: TaskType.SUGGEST_ACTIVITIES;
  tripId: string;
  destination: string;
  interests: string[];
  budget: number;
}

export interface CalculateBudgetPayload {
  type: TaskType.CALCULATE_BUDGET;
  tripId: string;
  accommodationCost: number;
  transportationCost: number;
  activitiesCost: number;
  mealsCost: number;
}

/**
 * Worker statistics
 */
export interface WorkerStats {
  totalProcessed: number;
  successful: number;
  failed: number;
  averageProcessingTime: number;
  startedAt: string;
}
