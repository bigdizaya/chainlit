import { cn } from '@/lib/utils';
import { useMemo, useState } from 'react';

import { IStarter, useChatSession, useConfig } from '@chainlit/react-client';

import Starter from './Starter';
import StarterCategory from './StarterCategory';

interface Props {
  className?: string;
}

const BAYYAN_DEFAULT_STARTERS: IStarter[] = [
  {
    label: "Comprendre une divergence d'avis",
    message:
      "Comment comprendre une divergence d'avis entre plusieurs savants ?"
  },
  {
    label: 'Comparer plusieurs références',
    message:
      'Compare plusieurs références reconnues sur une même question et explique leurs différences.'
  },
  {
    label: 'Retrouver un passage précis',
    message:
      'Aide-moi à retrouver un passage précis dans la bibliothèque et indique-moi sa source.'
  }
];

export default function Starters({ className }: Props) {
  const { chatProfile } = useChatSession();
  const { config } = useConfig();
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  const starters = useMemo(() => {
    if (chatProfile) {
      const selectedChatProfile = config?.chatProfiles.find(
        (profile) => profile.name === chatProfile
      );
      if (selectedChatProfile?.starters) {
        return selectedChatProfile.starters;
      }
    }
    return config?.starters?.length ? config.starters : BAYYAN_DEFAULT_STARTERS;
  }, [config, chatProfile]);

  const starterCategories = config?.starterCategories;

  if (starterCategories?.length) {
    const selectedCategoryData = starterCategories.find(
      (cat) => cat.label === selectedCategory
    );

    return (
      <div
        id="starters"
        className={cn('flex flex-col gap-4 items-center', className)}
      >
        <div className="flex gap-2 justify-center flex-wrap">
          {starterCategories.map((category) => (
            <StarterCategory
              key={category.label}
              category={category}
              isSelected={selectedCategory === category.label}
              onClick={() =>
                setSelectedCategory(
                  selectedCategory === category.label ? null : category.label
                )
              }
            />
          ))}
        </div>
        {selectedCategoryData?.starters?.length && (
          <div className="flex gap-2 justify-center flex-wrap">
            {selectedCategoryData.starters.map((starter) => (
              <Starter key={starter.label} starter={starter} />
            ))}
          </div>
        )}
      </div>
    );
  }

  if (!starters?.length) return null;

  return (
    <div
      id="starters"
      className={cn('flex gap-2 justify-center flex-wrap', className)}
    >
      {starters.map((starter, i) => (
        <Starter key={i} starter={starter} />
      ))}
    </div>
  );
}
