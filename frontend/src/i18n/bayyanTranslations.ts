import type { BayyanLocale } from '@chainlit/react-client';

type BayyanTranslation = {
  bayyan: {
    language: Record<'label' | BayyanLocale, string>;
    welcome: {
      eyebrow: string;
      title: string;
      description: string;
    };
    responseLevel: {
      legend: string;
      ariaLabel: string;
      concise: { label: string; short: string; description: string };
      deep: { label: string; short: string; description: string };
      changeError: string;
      syncError: string;
    };
    quota: {
      points: string;
      remainingLabel: string;
      concise: string;
      standard: string;
      deep: string;
      point: string;
      pointsUnit: string;
    };
    status: {
      searchInProgress: string;
      importantInformation: string;
      documentedAnswer: string;
      output: string;
    };
    navigation: { themeToggle: string; userImage: string };
    message: { userQuestion: string };
    voice: { transcriptionError: string; transcriptionEmpty: string };
  };
};

export const BAYYAN_TRANSLATIONS: Record<BayyanLocale, BayyanTranslation> = {
  fr: {
    bayyan: {
      language: {
        label: 'Langue',
        fr: 'Français',
        ar: 'العربية',
        en: 'English',
        es: 'Español'
      },
      welcome: {
        eyebrow: 'RECHERCHE DOCUMENTAIRE',
        title: 'Que souhaitez-vous éclaircir ?',
        description:
          'Interrogez la bibliothèque et retrouvez les passages utilisés dans chaque réponse.'
      },
      responseLevel: {
        legend: 'Format de réponse',
        ariaLabel: 'Mode de recherche',
        concise: {
          label: 'Rapide fiable',
          short: 'Rapide',
          description: 'Réponse directe, sourcée et maîtrisée, coût 1 point.'
        },
        deep: {
          label: 'Recherche approfondie',
          short: 'Approfondie',
          description: 'Recherche multi-angle, coût 3 points.'
        },
        changeError: 'Impossible de changer le mode de recherche.',
        syncError:
          "Le mode de réponse n'a pas pu être confirmé. Réessayez dans un instant."
      },
      quota: {
        points: 'Points',
        remainingLabel: 'Points restants : {{remaining}} sur {{limit}}',
        concise: 'Simple',
        standard: 'Standard',
        deep: 'Approfondi',
        point: 'point',
        pointsUnit: 'points'
      },
      status: {
        searchInProgress: 'Recherche en cours',
        importantInformation: 'INFORMATION IMPORTANTE',
        documentedAnswer: 'RÉPONSE DOCUMENTÉE',
        output: 'Résultat'
      },
      navigation: {
        themeToggle: 'Changer de thème',
        userImage: 'Photo de profil'
      },
      message: { userQuestion: 'Votre question' },
      voice: {
        transcriptionError: 'La transcription vocale a échoué. Réessayez.',
        transcriptionEmpty: "Aucun texte vocal n'a été détecté."
      }
    }
  },
  ar: {
    bayyan: {
      language: {
        label: 'اللغة',
        fr: 'Français',
        ar: 'العربية',
        en: 'English',
        es: 'Español'
      },
      welcome: {
        eyebrow: 'بحث موثّق',
        title: 'ما الذي ترغب في توضيحه؟',
        description: 'اسأل المكتبة واعثر على المقاطع المستخدمة في كل إجابة.'
      },
      responseLevel: {
        legend: 'صيغة الإجابة',
        ariaLabel: 'نمط البحث',
        concise: {
          label: 'إجابة سريعة موثوقة',
          short: 'سريعة',
          description: 'إجابة مباشرة وموثّقة ومنضبطة، بتكلفة نقطة واحدة.'
        },
        deep: {
          label: 'بحث معمّق',
          short: 'معمّقة',
          description: 'بحث متعدد الزوايا، بتكلفة 3 نقاط.'
        },
        changeError: 'تعذّر تغيير نمط البحث.',
        syncError: 'تعذّر تأكيد نمط الإجابة. أعد المحاولة بعد قليل.'
      },
      quota: {
        points: 'النقاط',
        remainingLabel: 'النقاط المتبقية: {{remaining}} من {{limit}}',
        concise: 'بسيط',
        standard: 'قياسي',
        deep: 'معمّق',
        point: 'نقطة',
        pointsUnit: 'نقاط'
      },
      status: {
        searchInProgress: 'البحث جارٍ',
        importantInformation: 'معلومة مهمة',
        documentedAnswer: 'إجابة موثّقة',
        output: 'النتيجة'
      },
      navigation: {
        themeToggle: 'تغيير السمة',
        userImage: 'الصورة الشخصية'
      },
      message: { userQuestion: 'سؤالك' },
      voice: {
        transcriptionError: 'تعذّر تحويل الصوت إلى نص. أعد المحاولة.',
        transcriptionEmpty: 'لم يتم اكتشاف أي نص صوتي.'
      }
    }
  },
  en: {
    bayyan: {
      language: {
        label: 'Language',
        fr: 'Français',
        ar: 'العربية',
        en: 'English',
        es: 'Español'
      },
      welcome: {
        eyebrow: 'DOCUMENTARY RESEARCH',
        title: 'What would you like to clarify?',
        description:
          'Search the library and find the passages used in every answer.'
      },
      responseLevel: {
        legend: 'Answer format',
        ariaLabel: 'Research mode',
        concise: {
          label: 'Reliable quick answer',
          short: 'Quick',
          description: 'Direct, sourced and focused answer, costs 1 point.'
        },
        deep: {
          label: 'In-depth research',
          short: 'In-depth',
          description: 'Multi-angle research, costs 3 points.'
        },
        changeError: 'The research mode could not be changed.',
        syncError:
          'The answer mode could not be confirmed. Please try again shortly.'
      },
      quota: {
        points: 'Points',
        remainingLabel: 'Points remaining: {{remaining}} of {{limit}}',
        concise: 'Simple',
        standard: 'Standard',
        deep: 'In-depth',
        point: 'point',
        pointsUnit: 'points'
      },
      status: {
        searchInProgress: 'Research in progress',
        importantInformation: 'IMPORTANT INFORMATION',
        documentedAnswer: 'DOCUMENTED ANSWER',
        output: 'Output'
      },
      navigation: {
        themeToggle: 'Change theme',
        userImage: 'Profile picture'
      },
      message: { userQuestion: 'Your question' },
      voice: {
        transcriptionError: 'Voice transcription failed. Please try again.',
        transcriptionEmpty: 'No spoken text was detected.'
      }
    }
  },
  es: {
    bayyan: {
      language: {
        label: 'Idioma',
        fr: 'Français',
        ar: 'العربية',
        en: 'English',
        es: 'Español'
      },
      welcome: {
        eyebrow: 'INVESTIGACIÓN DOCUMENTAL',
        title: '¿Qué desea aclarar?',
        description:
          'Consulte la biblioteca y encuentre los pasajes utilizados en cada respuesta.'
      },
      responseLevel: {
        legend: 'Formato de respuesta',
        ariaLabel: 'Modo de investigación',
        concise: {
          label: 'Respuesta rápida fiable',
          short: 'Rápida',
          description:
            'Respuesta directa, documentada y precisa, cuesta 1 punto.'
        },
        deep: {
          label: 'Investigación profunda',
          short: 'Profunda',
          description: 'Investigación desde varios ángulos, cuesta 3 puntos.'
        },
        changeError: 'No se pudo cambiar el modo de investigación.',
        syncError:
          'No se pudo confirmar el modo de respuesta. Inténtelo de nuevo en unos instantes.'
      },
      quota: {
        points: 'Puntos',
        remainingLabel: 'Puntos restantes: {{remaining}} de {{limit}}',
        concise: 'Simple',
        standard: 'Estándar',
        deep: 'Profundo',
        point: 'punto',
        pointsUnit: 'puntos'
      },
      status: {
        searchInProgress: 'Investigación en curso',
        importantInformation: 'INFORMACIÓN IMPORTANTE',
        documentedAnswer: 'RESPUESTA DOCUMENTADA',
        output: 'Resultado'
      },
      navigation: {
        themeToggle: 'Cambiar tema',
        userImage: 'Foto de perfil'
      },
      message: { userQuestion: 'Su pregunta' },
      voice: {
        transcriptionError:
          'La transcripción de voz falló. Inténtelo de nuevo.',
        transcriptionEmpty: 'No se detectó ningún texto hablado.'
      }
    }
  }
};
