import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext';

const STORAGE_KEY = 'surgelink-tour-completions';

const TOUR_STEPS = {
  super_admin: [
    {
      title: 'Command the full network',
      body: 'You can review every region, switch between hospitals instantly, and keep capacity decisions aligned across the system.',
    },
    {
      title: 'Update any hospital',
      body: 'Use the hospital detail view to revise capacity for any facility, no matter where the request originated.',
    },
    {
      title: 'Stay ahead of demand',
      body: 'Watch regional trends and transfer activity so you can respond quickly before capacity becomes a bottleneck.',
    },
  ],
  regional_coordinator: [
    {
      title: 'See the regional picture',
      body: 'The dashboard shows live capacity across all hospitals so you can spot pressure points early.',
    },
    {
      title: 'Review transfer flow',
      body: 'Open transfer requests to track who is waiting, what is accepted, and which beds are still available.',
    },
    {
      title: 'Inspect the audit trail',
      body: 'Use the audit log to verify actions and maintain accountability for every change.',
    },
  ],
  hospital_admin: [
    {
      title: 'Focus on your hospital',
      body: 'Start with hospital detail to confirm current bed availability and recent changes for your facility.',
    },
    {
      title: 'Keep capacity fresh',
      body: 'Update bed counts whenever the floor team changes availability to keep the system accurate.',
    },
    {
      title: 'Track trends over time',
      body: 'Use the trend chart to spot recurring pressure and plan earlier for incoming patient load.',
    },
  ],
  clinician: [
    {
      title: 'Create transfer requests',
      body: 'Use the transfer workflow to request a bed for a patient and keep the handoff moving smoothly.',
    },
    {
      title: 'Watch request status',
      body: 'Stay informed as receiving staff accept or reject the request in real time.',
    },
    {
      title: 'Coordinate quickly',
      body: 'A shared view of capacity helps you move faster without overloading the receiving team.',
    },
  ],
  receiving_staff: [
    {
      title: 'Review incoming transfers',
      body: 'Open transfer requests to decide quickly which patients can be accepted.',
    },
    {
      title: 'Reserve beds safely',
      body: 'Each decision uses atomic bed reservation so the last available bed is not double-booked.',
    },
    {
      title: 'Keep the workflow moving',
      body: 'Accept or reject requests promptly so the broader hospital network stays coordinated.',
    },
  ],
};

function getStoredCompletions() {
  if (typeof window === 'undefined') return {};
  try {
    return JSON.parse(window.localStorage.getItem(STORAGE_KEY) || '{}');
  } catch {
    return {};
  }
}

export default function RoleTour() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);

  const steps = useMemo(() => (user ? TOUR_STEPS[user.role] || TOUR_STEPS.clinician : []), [user]);

  useEffect(() => {
    if (!user || !steps.length) return;
    const completed = getStoredCompletions();
    if (!completed[user.role]) {
      setOpen(true);
    }
  }, [steps, user]);

  if (!user || !steps.length) return null;

  const closeTour = () => {
    const completed = getStoredCompletions();
    completed[user.role] = true;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(completed));
    setOpen(false);
    setStepIndex(0);
  };

  const nextStep = () => {
    if (stepIndex < steps.length - 1) {
      setStepIndex((current) => current + 1);
    } else {
      closeTour();
    }
  };

  const currentStep = steps[stepIndex];

  return (
    <>
      <button className="btn btn-secondary btn-sm" type="button" onClick={() => setOpen(true)}>
        Quick tour
      </button>
      {open && (
        <div className="tour-backdrop" role="dialog" aria-modal="true">
          <div className="tour-card">
            <div className="tour-badge">Role guide</div>
            <h3>{currentStep.title}</h3>
            <p>{currentStep.body}</p>
            <div className="tour-progress">
              {steps.map((_, index) => (
                <span key={index} className={index <= stepIndex ? 'active' : ''} />
              ))}
            </div>
            <div className="tour-actions">
              <button className="btn btn-secondary btn-sm" type="button" onClick={closeTour}>
                Skip
              </button>
              <button className="btn btn-primary btn-sm" type="button" onClick={nextStep}>
                {stepIndex === steps.length - 1 ? 'Finish' : 'Next'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
