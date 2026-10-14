package com.redox.backend.services;

import com.redox.backend.dto.Control;
import com.redox.backend.dto.Payload;
import com.redox.backend.model.Record;
import com.redox.backend.repository.RecordRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class RecordServiceTest {

    @Mock
    private RecordRepository recordRepository;

    @InjectMocks
    private RecordService recordService;

    private Record sampleRecord;

    @BeforeEach
    void setUp() {
        sampleRecord = new Record();
        sampleRecord.setId(1L);
        sampleRecord.setTimestamp("2026-10-13T20:00:00Z");
        sampleRecord.setSolar_power(12.5);
    }

    @Test
    void getLatestRecord_returnsRecordWhenPresent() {
        when(recordRepository.findTopByOrderByIdDesc()).thenReturn(Optional.of(sampleRecord));

        Optional<Record> result = recordService.getLatestRecord();

        assertTrue(result.isPresent());
        assertEquals(1L, result.get().getId());
        assertEquals(12.5, result.get().getSolar_power());
        verify(recordRepository, times(1)).findTopByOrderByIdDesc();
    }

    @Test
    void getRecentRecords_returnsListOfRecords() {
        when(recordRepository.findTop10ByOrderByIdDesc()).thenReturn(List.of(sampleRecord));

        List<Record> result = recordService.getRecentRecords();

        assertNotNull(result);
        assertEquals(1, result.size());
        assertEquals("2026-10-13T20:00:00Z", result.get(0).getTimestamp());
        verify(recordRepository, times(1)).findTop10ByOrderByIdDesc();
    }

    @Test
    void saveRecord_populatesAndSavesRecord() {
        Payload payload = new Payload();
        payload.setTimestamp("2026-10-13T20:00:00Z");
        payload.setSolar_power(15.0);
        payload.setEv1_soc(80.0);
        payload.setEv2_soc(65.0);
        payload.setBess_soc(90.0);
        payload.setGrid_availability(true);

        Control control = new Control();
        control.setEv1(true);
        control.setEv1_source(1);
        control.setEv2(false);
        control.setEv2_source(0);

        when(recordRepository.save(any(Record.class))).thenAnswer(invocation -> invocation.getArgument(0));

        Record saved = recordService.saveRecord(payload, control);

        assertNotNull(saved);
        assertEquals("2026-10-13T20:00:00Z", saved.getTimestamp());
        assertEquals(15.0, saved.getSolar_power());
        assertTrue(saved.isEv1());
        assertEquals(1, saved.getEv1_source());
        assertFalse(saved.isEv2());
        verify(recordRepository, times(1)).save(any(Record.class));
    }
}
