export const corpus = [
  {
    parser: "AddressListsParser",
    input: 'Mikel <a@b.com>, "x y" <c@d>, grp: e@f, g@h;',
    struct: {
      addresses: [
        {
          raw: "Mikel <a@b.com>",
          domain: "b.com",
          comments: [],
          local: "a",
          obsDomainList: null,
          displayName: "Mikel",
          group: null,
          error: null,
        },
        {
          raw: '"x y" <c@d>',
          domain: "d",
          comments: [],
          local: "c",
          obsDomainList: null,
          displayName: "x y",
          group: null,
          error: null,
        },
        {
          raw: " e@f",
          domain: "f",
          comments: [],
          local: "e",
          obsDomainList: null,
          displayName: null,
          group: "grp",
          error: null,
        },
        {
          raw: " g@h",
          domain: "h",
          comments: [],
          local: "g",
          obsDomainList: null,
          displayName: null,
          group: "grp",
          error: null,
        },
      ],
      groupNames: ["grp"],
      error: null,
    },
  },
  {
    parser: "AddressListsParser",
    input: '"a"@b.com, C <d@e>',
    struct: {
      addresses: [
        {
          raw: '"a"@b.com',
          domain: "b.com",
          comments: [],
          local: '"a"',
          obsDomainList: null,
          displayName: null,
          group: null,
          error: null,
        },
        {
          raw: "C <d@e>",
          domain: "e",
          comments: [],
          local: "d",
          obsDomainList: null,
          displayName: "a",
          group: null,
          error: null,
        },
      ],
      groupNames: [],
      error: null,
    },
  },
  {
    parser: "AddressListsParser",
    input: "A <a@b> (c), d@e",
    struct: {
      addresses: [
        {
          raw: "A <a@b>",
          domain: "b",
          comments: [],
          local: "a",
          obsDomainList: null,
          displayName: "A",
          group: null,
          error: null,
        },
        {
          raw: "d@e",
          domain: "e",
          comments: ["c"],
          local: "d",
          obsDomainList: null,
          displayName: null,
          group: null,
          error: null,
        },
      ],
      groupNames: [],
      error: null,
    },
  },
  {
    parser: "AddressListsParser",
    input: "<@x,@y:a@b>",
    struct: {
      addresses: [
        {
          raw: "<@x,@y:a@b>",
          domain: "b",
          comments: [],
          local: "a",
          obsDomainList: "@x,@y:",
          displayName: null,
          group: null,
          error: null,
        },
      ],
      groupNames: [],
      error: null,
    },
  },
  {
    parser: "AddressListsParser",
    input: "bad <<",
    error: "IncompleteParseError",
    message: 'Mail::AddressList can not parse |bad <<|: Only able to parse up to "bad <"',
  },
  {
    parser: "AddressListsParser",
    input: "café <ü@ex.com>",
    struct: {
      addresses: [
        {
          raw: "café <ü@ex.com>",
          domain: "ex.com",
          comments: [],
          local: "ü",
          obsDomainList: null,
          displayName: "café",
          group: null,
          error: null,
        },
      ],
      groupNames: [],
      error: null,
    },
  },
  {
    parser: "AddressListsParser",
    input: "",
    struct: {
      addresses: [],
      groupNames: [],
      error: null,
    },
  },
  {
    parser: "AddressListsParser",
    input: "   ",
    struct: {
      addresses: [],
      groupNames: [],
      error: null,
    },
  },
  {
    parser: "AddressListsParser",
    input: "undisclosed-recipients:;",
    struct: {
      addresses: [],
      groupNames: ["undisclosed-recipients"],
      error: null,
    },
  },
  {
    parser: "AddressListsParser",
    input: '"Lindsaar, Mikel" <test@lindsaar.net>',
    struct: {
      addresses: [
        {
          raw: '"Lindsaar, Mikel" <test@lindsaar.net>',
          domain: "lindsaar.net",
          comments: [],
          local: "test",
          obsDomainList: null,
          displayName: "Lindsaar, Mikel",
          group: null,
          error: null,
        },
      ],
      groupNames: [],
      error: null,
    },
  },
  {
    parser: "AddressListsParser",
    input: "test@lindsaar.net (Mikel Lindsaar)",
    struct: {
      addresses: [
        {
          raw: "test@lindsaar.net (Mikel Lindsaar)",
          domain: "lindsaar.net (Mikel Lindsaar)",
          comments: ["Mikel Lindsaar"],
          local: "test",
          obsDomainList: null,
          displayName: null,
          group: null,
          error: null,
        },
      ],
      groupNames: [],
      error: null,
    },
  },
  {
    parser: "AddressListsParser",
    input: "a@b;c@d",
    struct: {
      addresses: [
        {
          raw: "a@b",
          domain: "b",
          comments: [],
          local: "a",
          obsDomainList: null,
          displayName: null,
          group: null,
          error: null,
        },
        {
          raw: "c@d",
          domain: "d",
          comments: [],
          local: "c",
          obsDomainList: null,
          displayName: null,
          group: null,
          error: null,
        },
      ],
      groupNames: [],
      error: null,
    },
  },
  {
    parser: "ContentDispositionParser",
    input: 'attachment; filename="a b.txt"',
    struct: {
      dispositionType: "attachment",
      parameters: [
        {
          filename: "a b.txt",
        },
      ],
      error: null,
    },
  },
  {
    parser: "ContentDispositionParser",
    input: "inline",
    struct: {
      dispositionType: "inline",
      parameters: [],
      error: null,
    },
  },
  {
    parser: "ContentDispositionParser",
    input: "attachment; filename=x; size=3",
    struct: {
      dispositionType: "attachment",
      parameters: [
        {
          filename: "x",
        },
        {
          size: "3",
        },
      ],
      error: null,
    },
  },
  {
    parser: "ContentDispositionParser",
    input: "",
    struct: {
      dispositionType: "",
      parameters: [],
      error: null,
    },
  },
  {
    parser: "ContentDispositionParser",
    input: "attachment; =x",
    error: "IncompleteParseError",
    message:
      'Mail::ContentDispositionElement can not parse |attachment; =x|: Only able to parse up to "attachment; "',
  },
  {
    parser: "ContentDispositionParser",
    input: 'INLINE; Filename="Q"',
    struct: {
      dispositionType: "inline",
      parameters: [
        {
          Filename: "Q",
        },
      ],
      error: null,
    },
  },
  {
    parser: "ContentDispositionParser",
    input: "attachment;",
    error: "IncompleteParseError",
    message:
      'Mail::ContentDispositionElement can not parse |attachment;|: Only able to parse up to "attachment;"',
  },
  {
    parser: "ContentLocationParser",
    input: '"http://x/y"',
    struct: {
      location: "http://x/y",
      error: null,
    },
  },
  {
    parser: "ContentLocationParser",
    input: "foo",
    struct: {
      location: "foo",
      error: null,
    },
  },
  {
    parser: "ContentLocationParser",
    input: "",
    struct: {
      location: null,
      error: null,
    },
  },
  {
    parser: "ContentLocationParser",
    input: "a b",
    error: "IncompleteParseError",
    message: 'Mail::ContentLocationElement can not parse |a b|: Only able to parse up to "a "',
  },
  {
    parser: "ContentTransferEncodingParser",
    input: "base64",
    struct: {
      encoding: "base64",
      error: null,
    },
  },
  {
    parser: "ContentTransferEncodingParser",
    input: "b a d",
    error: "IncompleteParseError",
    message:
      'Mail::ContentTransferEncodingElement can not parse |b a d|: Only able to parse up to "b "',
  },
  {
    parser: "ContentTransferEncodingParser",
    input: "",
    struct: {
      encoding: "",
      error: null,
    },
  },
  {
    parser: "ContentTransferEncodingParser",
    input: "7BIT",
    struct: {
      encoding: "7bit",
      error: null,
    },
  },
  {
    parser: "ContentTransferEncodingParser",
    input: "quoted-printable (c)",
    struct: {
      encoding: "quoted-printable",
      error: null,
    },
  },
  {
    parser: "ContentTypeParser",
    input: 'text/plain; charset="utf-8"; format=flowed',
    struct: {
      mainType: "text",
      subType: "plain",
      parameters: [
        {
          charset: "utf-8",
        },
        {
          format: "flowed",
        },
      ],
      error: null,
    },
  },
  {
    parser: "ContentTypeParser",
    input: "multipart/mixed; boundary=abc",
    struct: {
      mainType: "multipart",
      subType: "mixed",
      parameters: [
        {
          boundary: "abc",
        },
      ],
      error: null,
    },
  },
  {
    parser: "ContentTypeParser",
    input: "text/plain; =x",
    error: "IncompleteParseError",
    message:
      'Mail::ContentTypeElement can not parse |text/plain; =x|: Only able to parse up to "text/plain; "',
  },
  {
    parser: "ContentTypeParser",
    input: "text/",
    error: "IncompleteParseError",
    message: 'Mail::ContentTypeElement can not parse |text/|: Only able to parse up to "text/"',
  },
  {
    parser: "ContentTypeParser",
    input: "",
    struct: {
      mainType: "text",
      subType: "plain",
      parameters: [],
      error: null,
    },
  },
  {
    parser: "ContentTypeParser",
    input: "TEXT/HTML",
    struct: {
      mainType: "text",
      subType: "html",
      parameters: [],
      error: null,
    },
  },
  {
    parser: "ContentTypeParser",
    input: "text/plain;",
    error: "IncompleteParseError",
    message:
      'Mail::ContentTypeElement can not parse |text/plain;|: Only able to parse up to "text/plain;"',
  },
  {
    parser: "ContentTypeParser",
    input: 'application/octet-stream; name="a;b"',
    struct: {
      mainType: "application",
      subType: "octet-stream",
      parameters: [
        {
          name: "a;b",
        },
      ],
      error: null,
    },
  },
  {
    parser: "ContentTypeParser",
    input: 'x-foo/bar; a=b; c="d"',
    struct: {
      mainType: "x-foo",
      subType: "bar",
      parameters: [
        {
          a: "b",
        },
        {
          c: "d",
        },
      ],
      error: null,
    },
  },
  {
    parser: "DateTimeParser",
    input: "Mon, 1 Jan 2024 10:00:00 +0000",
    struct: {
      dateString: " 1 Jan 2024 ",
      timeString: "10:00:00 +0000",
      error: null,
    },
  },
  {
    parser: "DateTimeParser",
    input: "garbage!!",
    error: "IncompleteParseError",
    message: 'Mail::DateTimeElement can not parse |garbage!!|: Only able to parse up to ""',
  },
  {
    parser: "DateTimeParser",
    input: null,
    error: "NilParseError",
    message: "Mail::DateTimeElement can not parse ||: nil is invalid",
  },
  {
    parser: "DateTimeParser",
    input: "1 Jan 2024 10:00 -0500 (EST)",
    struct: {
      dateString: "1 Jan 2024 ",
      timeString: "10:00 -0500",
      error: null,
    },
  },
  {
    parser: "DateTimeParser",
    input: "",
    error: "IncompleteParseError",
    message: 'Mail::DateTimeElement can not parse ||: Only able to parse up to ""',
  },
  {
    parser: "EnvelopeFromParser",
    input: "mikel@test.lindsaar.net Mon Aug 17 00:39:21 2009",
    struct: {
      address: "mikel@test.lindsaar.net",
      ctimeDate: "Mon Aug 17 00:39:21 2009",
      error: null,
    },
  },
  {
    parser: "EnvelopeFromParser",
    input: "<> Mon Aug 17 00:39:21 2009",
    struct: {
      address: "<>",
      ctimeDate: "Mon Aug 17 00:39:21 2009",
      error: null,
    },
  },
  {
    parser: "EnvelopeFromParser",
    input: "",
    struct: {
      address: null,
      ctimeDate: null,
      error: null,
    },
  },
  {
    parser: "EnvelopeFromParser",
    input: "x",
    struct: {
      address: "x",
      ctimeDate: null,
      error: null,
    },
  },
  {
    parser: "MessageIdsParser",
    input: "<a@b> <c@d>",
    struct: {
      messageIds: ["a@b", "c@d"],
      error: null,
    },
  },
  {
    parser: "MessageIdsParser",
    input: "<1234@local.machine.example>",
    struct: {
      messageIds: ["1234@local.machine.example"],
      error: null,
    },
  },
  {
    parser: "MessageIdsParser",
    input: null,
    error: "NilParseError",
    message: "Mail::MessageIdsElement can not parse ||: nil is invalid",
  },
  {
    parser: "MessageIdsParser",
    input: "",
    struct: {
      messageIds: [],
      error: null,
    },
  },
  {
    parser: "MessageIdsParser",
    input: "a@b",
    struct: {
      messageIds: ["a@b"],
      error: null,
    },
  },
  {
    parser: "MessageIdsParser",
    input: "<a@b>,<c@d>",
    struct: {
      messageIds: ["a@b", "c@d"],
      error: null,
    },
  },
  {
    parser: "MimeVersionParser",
    input: "1.0",
    struct: {
      major: "1",
      minor: "0",
      error: null,
    },
  },
  {
    parser: "MimeVersionParser",
    input: "1.0 (comment)",
    struct: {
      major: "1",
      minor: "0",
      error: null,
    },
  },
  {
    parser: "MimeVersionParser",
    input: "x",
    error: "IncompleteParseError",
    message: 'Mail::MimeVersionElement can not parse |x|: Only able to parse up to ""',
  },
  {
    parser: "MimeVersionParser",
    input: "",
    struct: {
      major: "",
      minor: null,
      error: null,
    },
  },
  {
    parser: "MimeVersionParser",
    input: "1 . 0",
    error: "IncompleteParseError",
    message: 'Mail::MimeVersionElement can not parse |1 . 0|: Only able to parse up to "1"',
  },
  {
    parser: "PhraseListsParser",
    input: 'Hello, World, "quoted, phrase"',
    struct: {
      phrases: ["Hello", "World", '"quoted, phrase"'],
      error: null,
    },
  },
  {
    parser: "PhraseListsParser",
    input: null,
    error: "NilParseError",
    message: "Mail::PhraseList can not parse ||: nil is invalid",
  },
  {
    parser: "PhraseListsParser",
    input: "",
    error: "IncompleteParseError",
    message: 'Mail::PhraseList can not parse ||: Only able to parse up to ""',
  },
  {
    parser: "PhraseListsParser",
    input: "one",
    struct: {
      phrases: ["one"],
      error: null,
    },
  },
  {
    parser: "PhraseListsParser",
    input: "a,,b",
    error: "IncompleteParseError",
    message: 'Mail::PhraseList can not parse |a,,b|: Only able to parse up to "a,"',
  },
  {
    parser: "ReceivedParser",
    input:
      "from localhost (localhost [127.0.0.1]) by mx.example.com; Mon, 1 Jan 2024 10:00:00 +0000",
    struct: {
      date: "1 Jan 2024",
      time: "10:00:00 +0000",
      info: "from localhost (localhost [127.0.0.1]) by mx.example.com",
      error: null,
    },
  },
  {
    parser: "ReceivedParser",
    input: "by x; Tue, 2 Jan 2024 00:00:00 -0000",
    struct: {
      date: "2 Jan 2024",
      time: "00:00:00 -0000",
      info: "by x",
      error: null,
    },
  },
  {
    parser: "ReceivedParser",
    input: null,
    error: "NilParseError",
    message: "Mail::ReceivedElement can not parse ||: nil is invalid",
  },
  {
    parser: "ReceivedParser",
    input: "garbage",
    error: "IncompleteParseError",
    message: 'Mail::ReceivedElement can not parse |garbage|: Only able to parse up to "garbage"',
  },
  {
    parser: "ReceivedParser",
    input: "",
    error: "IncompleteParseError",
    message: 'Mail::ReceivedElement can not parse ||: Only able to parse up to ""',
  },
];
