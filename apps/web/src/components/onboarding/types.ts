import type { OnboardingData, OnboardingStep } from "@stockflow/schemas";

export interface StepProps<K extends OnboardingStep> {
  /** Previously saved values for this step (if any). */
  initial: OnboardingData[K];
  /** All saved data, for steps that depend on earlier answers. */
  data: OnboardingData;
  onSubmit: (values: NonNullable<OnboardingData[K]>) => Promise<void>;
}

/** Every step renders a <form id={STEP_FORM_ID}> so the shared footer can submit it. */
export const STEP_FORM_ID = "onboarding-step";
