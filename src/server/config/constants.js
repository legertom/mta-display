module.exports = {
    FEEDS: {
        B_TRAIN: 'https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs-bdfm',
        Q_TRAIN: 'https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs-nqrw',
        IRT: 'https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs', // 1,2,3,4,5,6,7,S
        BUS_BASE_URL: 'https://bustime.mta.info/api/where',
        BUS_SIRI_URL: 'https://bustime.mta.info/api/siri',
    },
    STOPS: {
        SUBWAY: {
            CHURCH_AVE: 'D28N', // Northbound (Manhattan)
            WINTHROP_ST: '241N', // Northbound (Manhattan)
        },
        BUS: {
            B41_CATON: 'MTA_303241',
            B41_CLARKSON: 'MTA_303242',
            B49_ROGERS_LENOX: 'MTA_303944',
        },
    },
    ROUTES: {
        SUBWAY: ['B', 'Q', '2', '5'],
        BUS: ['B41', 'B49'],
    },
};
