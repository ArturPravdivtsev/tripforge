# Testing strategy

TripForge follows a testing pyramid: most checks should be fast unit and
component tests, with progressively fewer integration and browser tests.

```text
             Browser E2E
               few tests
                  /\
                 /  \
          HTTP / Integration
                 tests
               /      \
              /        \
        Unit / Component
             many tests
```

## Testing layers

- **Unit tests:** pure domain logic, services, helpers, and isolated controllers.
- **Component tests:** React components and user interactions without a real
  browser or backend.
- **Integration/API tests:** Nest modules, routing, validation, and persistence
  boundaries when those appear.
- **Browser E2E tests:** critical user journeys only. They are not implemented yet.

TripForge should avoid testing implementation details and should not rely only
on expensive browser E2E tests. This document will evolve with the application.
